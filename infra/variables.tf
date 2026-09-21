variable "project_id" {
  description = "Existing GCP project with billing enabled. Use a dedicated project for this app."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Set a valid Google Cloud project ID."
  }
}

variable "region" {
  description = "Cloud Run, Artifact Registry, Cloud Build, and source bucket region."
  type        = string
  default     = "us-central1"
}

variable "firestore_location" {
  description = "Firestore location (immutable). Null uses region; match the location if importing a database."
  type        = string
  default     = null
}

variable "service_name" {
  description = "Resource name prefix. Keep unchanged after deploying."
  type        = string
  default     = "code-sprint"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,18}[a-z0-9]$", var.service_name))
    error_message = "Use 4–20 lowercase letters, digits or hyphens, starting with a letter and ending with a letter/digit."
  }
}

variable "max_instances" {
  description = "Maximum Cloud Run instances."
  type        = number
  default     = 3
  validation {
    condition     = var.max_instances >= 1 && var.max_instances <= 100 && floor(var.max_instances) == var.max_instances
    error_message = "Use a whole number between 1 and 100."
  }
}

variable "image_revision" {
  description = "Change to force a fresh build even without app changes, e.g. to refresh the Docker base image."
  type        = string
  default     = "1"
}

variable "organizer_key_revision" {
  description = "Change to generate a new organizer key and deploy its Secret Manager version."
  type        = string
  default     = "1"
}
