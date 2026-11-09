# Copy these into the matching GitHub Environment's variables (see infra/README.md).
output "aws_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "ecr_api" {
  value = aws_ecr_repository.app["api"].repository_url
}

output "ecr_web" {
  value = aws_ecr_repository.app["web"].repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "api_url" {
  value = "https://${var.api_domain}"
}

output "web_url" {
  value = "https://${var.domain}"
}

output "media_url" {
  value = "https://${var.media_domain}"
}

output "media_bucket" {
  value = aws_s3_bucket.media.bucket
}

output "app_secret_name" {
  value = aws_secretsmanager_secret.app.name
}

output "db_endpoint" {
  value = aws_db_instance.db.address
}

output "plan_role_arn" {
  value = one(aws_iam_role.github_plan[*].arn)
}
