# Terraform deployment

One Terraform stack provisions and deploys Code Sprint in an **existing, billing-enabled GCP project**. Use a dedicated project: the app owns the default Firestore database and its deny-all browser rules. No local Docker installation is needed.

It manages API enablement, runtime/build service accounts and IAM, Artifact Registry, a private Cloud Build source bucket, Firestore and its leaderboard index/security rules, an organizer key in Secret Manager, and a public Cloud Run service. Cloud Build builds the existing Dockerfile during `terraform apply`; Cloud Run deploys only after the build, index, rules, and runtime permissions are ready.

## First deployment

Install Terraform **1.7+**, Python **3.9+**, and the Google Cloud CLI. Set up a billing-enabled project first. The deployer needs permissions to enable APIs, manage project IAM/service accounts, Firestore and rules, buckets, Artifact Registry, secrets, Cloud Build, and Cloud Run, plus permission to act as the build/runtime accounts. A project Owner can bootstrap a dedicated project; a restricted deployer needs equivalent scoped roles. Organization policies must permit public Cloud Run invocation and the selected region.

Terraform uses Application Default Credentials; the build helper uses the active `gcloud` account. Authenticate both as the intended deployer:

```sh
gcloud auth login
gcloud auth application-default login
cd infra
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars and set project_id and region.
# Optionally set custom_domain after verifying it with Google.
terraform init
terraform plan -out=deploy.tfplan
terraform apply deploy.tfplan
terraform output -raw app_url
terraform output -raw organizer_key_command
```

If `custom_domain` is set, Terraform creates the Cloud Run mapping but does not
edit DNS hosted outside GCP. After apply, run
`terraform output -json custom_domain_dns_records`, add the returned records at
your DNS provider, and keep the generated `run.app` URL as a rollback path.
Google provisions and renews TLS after DNS resolves; issuance can take several
minutes and occasionally up to 24 hours. Direct Cloud Run domain mapping is a
Google preview feature and is intended here as the smallest configuration for a
club app; a global external Application Load Balancer is the documented
production alternative if its limitations become material.

Run the printed organizer-key command privately; enter that key in the app's competition creation form. Competitors only need their competition link.

Applying provisions billable cloud resources and publishes the app. Validation and mock tests do not. The stack enables the Service Usage API, but the project must already allow the deployer to call Service Usage to bootstrap API enablement (normally available in an initialized GCP project).

Open the URL, create a competition, finish it, and reload to confirm the record persists. `/healthz` checks the HTTP process; the complete competition flow verifies Firestore permissions and the index.

## Builds and updates

Edit the app and run `terraform plan` / `terraform apply` again. A hash of the Dockerfile, package files, all `src/` and `public/` files, build configuration, build helper, and `image_revision` changes the image tag and triggers a new build. Do not edit source between saving a plan and applying it; re-plan if files change.

The helper stages only the exact application file list in a temporary directory and calls `gcloud builds submit` with the dedicated builder identity. It excludes `problems/`, `.env`, databases, credentials, Terraform state and plans, and `node_modules`. Cloud Build builds on Linux and pushes to Artifact Registry. The private source bucket expires uploaded source archives after seven days. Application images remain in Artifact Registry for rollback; they incur storage charges until removed.

A no-change apply does not rebuild. Change `image_revision` to force a fresh build (for example, to pick up a Node base-image security update). A failed build stops apply; fix the error and reapply. Newly granted IAM permissions can take time to propagate; if the first build gets a permission error immediately after provisioning, wait and reapply. If an image was deleted externally, use `terraform apply -replace=terraform_data.image` to rebuild it.

The Cloud Build step is a Terraform `local-exec` provisioner because Terraform doesn't build container images itself. Consequently, the machine running **apply**, including a CI runner, needs Python, `gcloud`, authenticated network access, and this complete repository checkout. It must not run with only the `infra/` directory. Cloud Build has no organizer-secret access, and the runtime has no build permissions.

Change `organizer_key_revision` to rotate the generated key; apply creates a new secret version and updates Cloud Run to that exact version. Creation forms need the new key after rollout. Existing competition links and scores remain valid.

## State and secrets

The default Terraform backend stores state locally in `infra/terraform.tfstate`. **State contains the generated organizer key**, even though the value is sensitive and not printed in outputs. State, saved plans, `.terraform`, and actual `.tfvars` files are gitignored. Commit `.terraform.lock.hcl` and `terraform.tfvars.example`.

Keep state securely backed up. For team/CI use, configure a GCS backend in a separately provisioned state bucket with restricted IAM, uniform bucket access, public access prevention, and object versioning. Do not use the app's build-source bucket: its contents expire and it is disposable.

```hcl
# infra/backend.tf — replace the bucket name with an existing secure state bucket.
terraform {
  backend "gcs" {
    bucket = "your-private-terraform-state-bucket"
    prefix = "code-sprint/production"
  }
}
```

Then run `terraform init -migrate-state`. The state bucket is intentionally outside this app stack so destroying application infrastructure cannot delete its own state. Do not commit state, plans, exported service-account keys, or organizer secrets.

## Existing deployments

Do **not** apply over existing resources without importing them. Terraform cannot infer ownership. Stop using the manual deployment commands after adopting Terraform.

For the earlier manual deployment, set `project_id`, `region`, `service_name` (default `code-sprint`), and `firestore_location` to the existing values, initialize, then import the resources that already exist. For example:

```sh
terraform import google_firestore_database.app 'projects/PROJECT_ID/databases/(default)'
terraform import google_service_account.runtime 'projects/PROJECT_ID/serviceAccounts/code-sprint@PROJECT_ID.iam.gserviceaccount.com'
terraform import google_secret_manager_secret.organizer 'projects/PROJECT_ID/secrets/code-sprint-admin'
terraform import google_cloud_run_v2_service.app 'projects/PROJECT_ID/locations/us-central1/services/code-sprint'
terraform import google_firestore_index.leaderboard 'projects/PROJECT_ID/databases/(default)/collectionGroups/attempts/indexes/INDEX_ID'
```

If existing Firebase rules have been deployed, import the release too:

```sh
terraform import google_firebaserules_release.firestore 'projects/PROJECT_ID/releases/cloud.firestore'
```

Find `INDEX_ID` with `gcloud firestore indexes composite list --project=PROJECT_ID --database='(default)'`. Existing repository/bucket/builder resources with the same names must also be imported if present. Resource-specific import formats are in the [Google provider documentation](https://registry.terraform.io/providers/hashicorp/google/latest/docs).

Review the plan: the imported database must **not** be replaced. Terraform enables delete protection and adopts the existing data. It creates its own container repository/build pipeline and a newly generated organizer-secret version, so retrieve the new organizer key after adoption. Existing competitions and results are retained. If the project hosts unrelated apps, use a dedicated project instead of replacing their default Firestore rules.

## Removal and recovery

The database has both Terraform `prevent_destroy` and Google delete protection. An ordinary `terraform destroy` is deliberately blocked to protect scores. For an intentional teardown while retaining data, back up state and change only the database lifecycle setting to `prevent_destroy = false`, keeping `deletion_policy = "ABANDON"` and Google delete protection enabled. Review `terraform plan -destroy` before running `terraform destroy`. Terraform then removes the database from state without deleting it, and removes the other application resources. The database remains in GCP, protected and billable. Deleting it permanently requires an explicit separate operation to disable delete protection and delete the data.

The build-source bucket is disposable (`force_destroy = true`); it must never hold application data or state. Project APIs are left enabled when resources are destroyed. Firestore deletion protection does not replace backups; configure a backup policy suitable for the club's records.

## Local verification

```sh
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
terraform test
python3 -m unittest discover -s tests -p 'test_*.py'
```

Terraform tests use mocked providers and plan only: no cloud resources, credentials, or builds are needed. They check persistent storage, index shape, Cloud Run settings, public access, build-source isolation, and organizer authentication. Python tests cover safe staging and propagation of build failures. Real GCP IAM, organization policies, deployment, and startup still require a live plan/apply and post-deploy smoke test.

References: [Cloud Build custom service accounts](https://cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts), [Cloud Run Terraform resource](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/cloud_run_v2_service), [Firestore Terraform resource](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/firestore_database).
