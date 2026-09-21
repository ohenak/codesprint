mock_provider "google" {}
mock_provider "random" {}

variables {
  project_id = "code-sprint-test"
}

run "deployment_contract" {
  command = plan

  assert {
    condition     = google_firestore_database.app.type == "FIRESTORE_NATIVE" && google_firestore_database.app.delete_protection_state == "DELETE_PROTECTION_ENABLED"
    error_message = "Results must use protected persistent Firestore storage."
  }
  assert {
    condition     = google_firestore_index.leaderboard.query_scope == "COLLECTION" && google_firestore_index.leaderboard.fields[0].field_path == "completed" && google_firestore_index.leaderboard.fields[1].order == "DESCENDING"
    error_message = "Deploy the leaderboard's completed/WPM index."
  }
  assert {
    condition     = google_cloud_run_v2_service.app.template[0].scaling[0].max_instance_count == 3 && google_cloud_run_v2_service.app.template[0].scaling[0].min_instance_count == 0
    error_message = "Cloud Run must scale to zero and respect the default instance cap."
  }
  assert {
    condition     = contains([for env in google_cloud_run_v2_service.app.template[0].containers[0].env : "${env.name}=${env.value}" if env.value != null], "STORAGE=firestore")
    error_message = "Cloud Run must never use ephemeral SQLite storage."
  }
  assert {
    condition     = google_cloud_run_v2_service_iam_member.public.member == "allUsers" && google_cloud_run_v2_service_iam_member.public.role == "roles/run.invoker"
    error_message = "Competition links must be accessible without Google login."
  }
  assert {
    condition     = alltrue([for file in local.app_files : contains(["Dockerfile", "package.json", "package-lock.json"], file) || startswith(file, "src/") || startswith(file, "public/")]) && contains(local.app_files, "public/typing.js")
    error_message = "Build only application files, including the shared typing/scoring module."
  }
  assert {
    condition     = google_storage_bucket.build_source.public_access_prevention == "enforced" && google_storage_bucket.build_source.uniform_bucket_level_access
    error_message = "Build source archives must remain private."
  }
  assert {
    condition     = random_password.organizer.length >= 24 && google_project_iam_member.runtime_firestore.role == "roles/datastore.user"
    error_message = "Provide organizer authentication and Firestore access."
  }
}
