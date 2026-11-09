# Bharini infrastructure (AWS, ap-south-1)

```
Route 53 ─┬─ bharini.com, api.bharini.com ─> ALB (+WAF, TLS) ─┬─ web  (ECS Fargate, Next)
          │                                                   └─ api  (ECS Fargate, Django) ─┬─ RDS Postgres 17
          └─ media.bharini.com ─> CloudFront ─> S3 (private)                                 └─ ElastiCache Redis
EventBridge Scheduler ─> api task: purge_deleted_accounts, daily 03:00 IST
GitHub Actions ─(OIDC)─> deploy role: push images to ECR, migrate, roll ECS services
```

| Path | What |
|---|---|
| `modules/app/` | Everything for one environment. |
| `envs/staging/` | `staging.bharini.com`, small sizes, one NAT, no deletion protection. |
| `envs/prod/` | `bharini.com`, Multi-AZ RDS, 2+ tasks, deletion protection, 14-day backups. |

Terraform owns infrastructure. GitHub Actions (`.github/workflows/deploy.yml`) owns which image runs.

## First-time setup (once per environment)

### 1. AWS accounts
1. In the management account, turn on **AWS Organizations** and create two member accounts: `bharini-staging` and `bharini-prod`.
2. Turn on **IAM Identity Center** and give each person their own login. Don't use root or IAM access keys day to day.
3. In each account, create a monthly **AWS Budget** with an email alert.
4. Locally: `aws configure sso`, then a profile per account (`bharini-staging`, `bharini-prod`).

### 2. DNS
The domain's DNS is at GoDaddy today, and so is email (`smtpout.secureserver.net`).
1. In the **prod** account, create a Route 53 public hosted zone `bharini.com`.
2. **Copy every existing GoDaddy record first** (MX, SPF/TXT, DKIM, CNAMEs). If you skip this, email stops working.
3. At GoDaddy, change the domain's nameservers to the 4 Route 53 ones.
4. In the **staging** account, create a hosted zone `staging.bharini.com`. Add its 4 NS records as an `NS` record named `staging` in the prod `bharini.com` zone.

### 3. Terraform state bucket (per account)
```bash
export AWS_PROFILE=bharini-staging   # then repeat with bharini-prod
B=bharini-tfstate-$(aws sts get-caller-identity --query Account --output text)
aws s3api create-bucket --bucket $B --region ap-south-1 --create-bucket-configuration LocationConstraint=ap-south-1
aws s3api put-bucket-versioning --bucket $B --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket $B --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### 4. Apply
Requires Terraform 1.10 or newer.
```bash
cd infra/envs/staging
terraform init -backend-config="bucket=$B"
terraform plan -out tfplan
terraform apply tfplan            # ~20 min (RDS, CloudFront)
terraform output -json app
```
The ECS services can't start until the first deploy pushes images. Their errors right after the first apply are expected.

### 5. App secrets
Terraform creates `bharini-<env>/app` with a generated `DJANGO_SECRET_KEY` and blank values for the rest. Fill them in. Keep that key, and never commit the file:
```bash
cat > app-secret.json <<'EOF'
{"DJANGO_SECRET_KEY": "<keep the generated one>", "GOOGLE_CLIENT_ID": "...",
 "GOOGLE_CLIENT_SECRET": "...", "EMAIL_HOST_PASSWORD": "..."}
EOF
aws secretsmanager get-secret-value --secret-id bharini-staging/app --query SecretString --output text  # current values
aws secretsmanager put-secret-value --secret-id bharini-staging/app --secret-string file://app-secret.json && rm app-secret.json
```
The DB password is created and rotated by RDS in its own secret. You don't need to touch it.

In Google Cloud Console → OAuth client, add the redirect URI `https://api.staging.bharini.com/accounts/google/login/callback/`. Add the matching URI for prod.

### 6. GitHub
Repo → Settings → Environments:
- `staging`: deployment branch `dev`.
- `production`: deployment branch `main`. No reviewers here; the api and web jobs run in it.
- `production-approval`: deployment branch `main`, plus **Required reviewers**. This is the single approval gate before prod.

In `staging` and `production`, add these **variables** (not secrets; none of them are sensitive), taken from `terraform output -json app`:

| Variable | From output |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `aws_deploy_role_arn` |
| `ECR_API` | `ecr_api` |
| `ECR_WEB` | `ecr_web` |
| `ECS_CLUSTER` | `ecs_cluster` |
| `API_URL` | `api_url` |
| `WEB_URL` | `web_url` |

Push to `dev` to make the first staging deploy. If only one of backend/web changed, use **Actions → Deploy → Run workflow → both** the first time, so both images exist.

In Settings → Branches, protect `dev` and `main`: require pull requests, require the `CI` checks to pass, and turn on **Require review from Code Owners** (`.github/CODEOWNERS`).

**PR plans (optional):** set `plan_state_bucket` in `envs/<env>/main.tf` and apply. Then add these repo-level variables (not environment variables): `TF_PLAN_ROLE_STAGING`/`TF_PLAN_ROLE_PROD` (output `plan_role_arn`) and `TF_STATE_BUCKET_STAGING`/`TF_STATE_BUCKET_PROD`. Without them, `terraform.yml` only checks fmt and validate.

### 7. Existing media
```bash
aws s3 sync backend/media s3://$(terraform output -json app | jq -r .media_bucket)/
```
The object keys match the stored `FileField` names, so existing DB rows still point to the right files.

## Day to day
- **Deploy:** merge to `dev` deploys staging. Merge `dev` into `main`, then approve, to deploy prod.
- **Rollback:** re-run the Deploy workflow for an older commit. A revision that never becomes healthy rolls back on its own (ECS circuit breaker).
- **Django shell / createsuperuser** (needs the AWS Session Manager plugin):
  ```bash
  T=$(aws ecs list-tasks --cluster bharini-staging --service-name api --query 'taskArns[0]' --output text)
  aws ecs execute-command --cluster bharini-staging --task $T --container api --interactive \
    --command "python manage.py createsuperuser"
  ```
- **Logs:** CloudWatch `/ecs/bharini-<env>/api` and `/web`.
- **Infra change:** edit `modules/app`, run `terraform plan` on staging, apply, then do the same for prod.

## Mobile
Not hosted on AWS. Build with EAS and set `EXPO_PUBLIC_API_BASE_URL=https://api.staging.bharini.com` (or the prod URL) in the `eas.json` build profile env.

## Cost switches (`envs/<env>/main.tf`)
| Switch | Effect | ≈ $/mo |
|---|---|---|
| `lean = true` | No NAT (tasks get public IPs; the security group still only allows the ALB), no Redis, no WAF, no Container Insights | saves ~65 |
| `high_availability = true` | Multi-AZ RDS standby, one NAT per AZ | adds ~60–100 |

Staging ships `lean = true`. Prod ships `lean = false, high_availability = false`. Flip HA on before public launch.

## Rough monthly cost (Mumbai list prices; verify in the AWS Pricing Calculator)
- **Staging (lean):** ~$75–90. ALB ~$20, Fargate ~$31, RDS t4g.micro ~$18, public IPs ~$11, logs/secrets/DNS/ECR ~$5, plus media traffic.
- **Prod (current settings):** ~$200–250. One NAT ~$41, 2 api + 2 web tasks ~$62, RDS t4g.small ~$35, Redis ~$12, WAF ~$8, ALB/IPs ~$35.
- **Prod with HA:** ~$300–400.
- **Traffic:** CloudFront to India is ~$0.11/GB, which grows with video views.
- Apply for **AWS Activate** credits before the first apply.
