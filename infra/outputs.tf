output "app_url" {
  description = "Public Code Sprint URL."
  value       = google_cloud_run_v2_service.app.uri
}

output "container_image" {
  description = "Content-tagged image deployed to Cloud Run."
  value       = local.image
}

output "organizer_key_command" {
  description = "Run privately to retrieve the organizer key. No secret is printed by Terraform outputs."
  value       = "gcloud secrets versions access ${google_secret_manager_secret_version.organizer.version} --secret=${google_secret_manager_secret.organizer.secret_id} --project=${var.project_id}"
}
