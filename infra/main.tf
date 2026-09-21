locals {
  app_root = abspath("${path.module}/..")
  services = toset([
    "serviceusage.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "firestore.googleapis.com",
    "firebaserules.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "logging.googleapis.com",
  ])
  # Only these files are sent to Cloud Build. No state, secrets, or local databases.
  app_files = sort(concat(
    ["Dockerfile", "package.json", "package-lock.json"],
    [for file in fileset("${local.app_root}/src", "**") : "src/${file}"],
    [for file in fileset("${local.app_root}/public", "**") : "public/${file}"],
  ))
  source_hash = sha256(jsonencode({
    files          = { for file in local.app_files : file => filesha256("${local.app_root}/${file}") }
    build_config   = filesha256("${path.module}/cloudbuild.yaml")
    build_script   = filesha256("${path.module}/scripts/build.py")
    image_revision = var.image_revision
  }))
  image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}/app:${local.source_hash}"
}

resource "google_project_service" "required" {
  for_each           = local.services
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "runtime" {
  account_id   = var.service_name
  display_name = "Code Sprint runtime"
  depends_on   = [google_project_service.required]
}

resource "google_service_account" "builder" {
  account_id   = "${var.service_name}-build"
  display_name = "Code Sprint container builder"
  depends_on   = [google_project_service.required]
}

resource "google_project_iam_member" "runtime_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "builder_logs" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = var.service_name
  description   = "Code Sprint application images"
  format        = "DOCKER"
  depends_on    = [google_project_service.required]
}

resource "google_artifact_registry_repository_iam_member" "builder" {
  location   = google_artifact_registry_repository.app.location
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_storage_bucket" "build_source" {
  name                        = "${var.project_id}-${var.service_name}-build"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = true
  lifecycle_rule {
    condition { age = 7 }
    action { type = "Delete" }
  }
  depends_on = [google_project_service.required]
}

resource "google_storage_bucket_iam_member" "builder_source" {
  bucket = google_storage_bucket.build_source.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_firestore_database" "app" {
  name                    = "(default)"
  location_id             = coalesce(var.firestore_location, var.region)
  type                    = "FIRESTORE_NATIVE"
  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  deletion_policy         = "ABANDON"
  lifecycle { prevent_destroy = true }
  depends_on = [google_project_service.required]
}

resource "google_firestore_index" "leaderboard" {
  database    = google_firestore_database.app.name
  collection  = "attempts"
  query_scope = "COLLECTION"
  fields {
    field_path = "completed"
    order      = "ASCENDING"
  }
  fields {
    field_path = "wpm"
    order      = "DESCENDING"
  }
}

resource "google_firebaserules_ruleset" "firestore" {
  source {
    files {
      name    = "firestore.rules"
      content = file("${local.app_root}/firestore.rules")
    }
  }
  lifecycle { create_before_destroy = true }
  depends_on = [google_firestore_database.app]
}

resource "google_firebaserules_release" "firestore" {
  name         = "cloud.firestore"
  ruleset_name = google_firebaserules_ruleset.firestore.id
}

resource "random_password" "organizer" {
  length  = 48
  special = false
  keepers = { revision = var.organizer_key_revision }
}

resource "google_secret_manager_secret" "organizer" {
  secret_id = "${var.service_name}-admin"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "organizer" {
  secret      = google_secret_manager_secret.organizer.id
  secret_data = random_password.organizer.result
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  secret_id = google_secret_manager_secret.organizer.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# Cloud Build builds for Cloud Run on Linux; local Docker is not required.
# Failed builds fail apply. Re-applying retries the failed provisioner.
resource "terraform_data" "image" {
  triggers_replace = {
    image         = local.image
    builder       = google_service_account.builder.name
    source_bucket = google_storage_bucket.build_source.name
    repository    = google_artifact_registry_repository.app.id
  }
  provisioner "local-exec" {
    working_dir = path.module
    command     = "python3 scripts/build.py"
    environment = {
      APP_ROOT      = local.app_root
      APP_FILES     = jsonencode(local.app_files)
      PROJECT_ID    = var.project_id
      BUILD_REGION  = var.region
      BUILD_ACCOUNT = google_service_account.builder.name
      SOURCE_BUCKET = google_storage_bucket.build_source.name
      IMAGE         = local.image
      BUILD_CONFIG  = abspath("${path.module}/cloudbuild.yaml")
    }
  }
  depends_on = [
    google_artifact_registry_repository_iam_member.builder,
    google_storage_bucket_iam_member.builder_source,
    google_project_iam_member.builder_logs,
  ]
}

resource "google_cloud_run_v2_service" "app" {
  name                = var.service_name
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"
  template {
    service_account = google_service_account.runtime.email
    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instances
    }
    containers {
      image = local.image
      ports { container_port = 8080 }
      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "STORAGE"
        value = "firestore"
      }
      env {
        name = "ADMIN_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.organizer.secret_id
            version = google_secret_manager_secret_version.organizer.version
          }
        }
      }
      startup_probe {
        initial_delay_seconds = 0
        period_seconds        = 3
        timeout_seconds       = 2
        failure_threshold     = 20
        http_get { path = "/healthz" }
      }
    }
  }
  depends_on = [
    terraform_data.image,
    google_firestore_index.leaderboard,
    google_firebaserules_release.firestore,
    google_project_iam_member.runtime_firestore,
    google_secret_manager_secret_iam_member.runtime,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# The generated run.app address remains active as a rollback path. DNS is
# updated separately after Google returns the exact record for this mapping.
resource "google_cloud_run_domain_mapping" "app" {
  count    = var.custom_domain == null ? 0 : 1
  name     = var.custom_domain
  location = var.region

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.app.name
  }

  depends_on = [google_cloud_run_v2_service_iam_member.public]
}
