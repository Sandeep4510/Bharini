# Containers, secrets, IAM, the daily purge job and the GitHub Actions deploy role.

# ---------------------------------------------------------------- images

resource "aws_ecr_repository" "app" {
  for_each             = toset(["api", "web"])
  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "IMMUTABLE" # tags are git SHAs
  force_delete         = !local.prod
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "keep the last 30 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
      action       = { type = "expire" }
    }]
  })
}

# ---------------------------------------------------------------- secrets

resource "random_password" "django_secret_key" {
  length  = 64
  special = false
}

# One JSON secret for app credentials. Terraform seeds it once; fill the blanks in the console:
#   aws secretsmanager put-secret-value --secret-id bharini-<env>/app --secret-string file://app-secret.json
resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.name}/app"
  recovery_window_in_days = local.prod ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    DJANGO_SECRET_KEY    = random_password.django_secret_key.result
    GOOGLE_CLIENT_ID     = ""
    GOOGLE_CLIENT_SECRET = ""
    EMAIL_HOST_PASSWORD  = ""
  })
  lifecycle {
    ignore_changes = [secret_string] # real values are set outside Terraform
  }
}

locals {
  app_secret = aws_secretsmanager_secret.app.arn
  db_secret  = aws_db_instance.db.master_user_secret[0].secret_arn

  # No REDIS_URL in lean mode: Django falls back to a per-task in-memory cache.
  redis_env = { for c in aws_elasticache_cluster.redis : "REDIS_URL" => "redis://${c.cache_nodes[0].address}:6379/0" }

  api_env = merge(var.email, var.api_extra_env, local.redis_env, {
    DJANGO_DEBUG            = "false"
    DJANGO_ALLOWED_HOSTS    = var.api_domain
    FRONTEND_URL            = "https://${var.domain}"
    CORS_ALLOWED_ORIGINS    = "https://${var.domain}"
    CSRF_TRUSTED_ORIGINS    = "https://${var.domain},https://${var.api_domain}"
    AUTH_COOKIE_SECURE      = "true"
    DB_HOST                 = aws_db_instance.db.address
    DB_PORT                 = tostring(aws_db_instance.db.port)
    DB_NAME                 = aws_db_instance.db.db_name
    AWS_STORAGE_BUCKET_NAME = aws_s3_bucket.media.bucket
    AWS_S3_REGION_NAME      = data.aws_region.current.region
    AWS_S3_CUSTOM_DOMAIN    = var.media_domain
  })

  api_secrets = {
    DB_USER              = "${local.db_secret}:username::"
    DB_PASSWORD          = "${local.db_secret}:password::"
    DJANGO_SECRET_KEY    = "${local.app_secret}:DJANGO_SECRET_KEY::"
    GOOGLE_CLIENT_ID     = "${local.app_secret}:GOOGLE_CLIENT_ID::"
    GOOGLE_CLIENT_SECRET = "${local.app_secret}:GOOGLE_CLIENT_SECRET::"
    EMAIL_HOST_PASSWORD  = "${local.app_secret}:EMAIL_HOST_PASSWORD::"
  }
}

# ---------------------------------------------------------------- IAM

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Used by ECS itself: pull images, write logs, read secrets.
resource "aws_iam_role" "execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [local.app_secret, local.db_secret]
    }]
  })
}

# Used by the Django code: media bucket, plus ECS Exec for `manage.py` shells.
resource "aws_iam_role" "api_task" {
  name               = "${local.name}-api-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy" "api_task" {
  role = aws_iam_role.api_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.media.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.media.arn
      },
      {
        Effect = "Allow"
        Action = [
          "ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel",
        ]
        Resource = "*"
      },
    ]
  })
}

# ---------------------------------------------------------------- ECS

resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = var.lean ? "disabled" : "enabled"
  }
}

resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["api", "web"])
  name              = "/ecs/${local.name}/${each.key}"
  retention_in_days = local.prod ? 90 : var.log_retention_days
}

# The image tag here is only a placeholder: GitHub Actions registers new revisions
# with the real git-SHA image, and the services ignore task_definition drift.
resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.api_task.arn
  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name         = "api"
    image        = "${aws_ecr_repository.app["api"].repository_url}:bootstrap"
    essential    = true
    portMappings = [{ containerPort = 8000, protocol = "tcp" }]
    environment  = [for k, v in local.api_env : { name = k, value = v }]
    secrets      = [for k, v in local.api_secrets : { name = k, valueFrom = v }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app["api"].name
        awslogs-region        = data.aws_region.current.region
        awslogs-stream-prefix = "api"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${local.name}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.web_cpu
  memory                   = var.web_memory
  execution_role_arn       = aws_iam_role.execution.arn
  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name         = "web"
    image        = "${aws_ecr_repository.app["web"].repository_url}:bootstrap"
    essential    = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app["web"].name
        awslogs-region        = data.aws_region.current.region
        awslogs-stream-prefix = "web"
      }
    }
  }])
}

locals {
  services = {
    api = { task = aws_ecs_task_definition.api.arn, tg = aws_lb_target_group.api.arn, port = 8000, count = var.api_count }
    web = { task = aws_ecs_task_definition.web.arn, tg = aws_lb_target_group.web.arn, port = 3000, count = var.web_count }
  }
}

resource "aws_ecs_service" "app" {
  for_each               = local.services
  name                   = each.key
  cluster                = aws_ecs_cluster.main.id
  task_definition        = each.value.task
  desired_count          = each.value.count
  launch_type            = "FARGATE"
  enable_execute_command = each.key == "api"
  propagate_tags         = "SERVICE"

  network_configuration {
    subnets          = local.task_subnets
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = local.task_public_ip
  }

  load_balancer {
    target_group_arn = each.value.tg
    container_name   = each.key
    container_port   = each.value.port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true # a revision that never gets healthy rolls back on its own
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count] # owned by CI and autoscaling
  }

  depends_on = [aws_lb_listener.https]
}

resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app["api"].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.api_count
  max_capacity       = var.api_max_count
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.name}-api-cpu"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  policy_type        = "TargetTrackingScaling"
  target_tracking_scaling_policy_configuration {
    target_value = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# ---------------------------------------------------------------- daily purge of deleted accounts

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${local.name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

resource "aws_iam_role_policy" "scheduler" {
  role = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = ["ecs:RunTask"]
        Resource  = "${aws_ecs_task_definition.api.arn_without_revision}:*"
        Condition = { ArnLike = { "ecs:cluster" = aws_ecs_cluster.main.arn } }
      },
      {
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [aws_iam_role.execution.arn, aws_iam_role.api_task.arn]
      },
    ]
  })
}

resource "aws_scheduler_schedule" "purge_deleted_accounts" {
  name                         = "${local.name}-purge-deleted-accounts"
  schedule_expression          = "cron(0 3 * * ? *)"
  schedule_expression_timezone = "Asia/Kolkata"
  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_ecs_cluster.main.arn
    role_arn = aws_iam_role.scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.api.arn_without_revision # latest revision = latest deploy
      launch_type         = "FARGATE"
      network_configuration {
        subnets          = local.task_subnets
        security_groups  = [aws_security_group.app.id]
        assign_public_ip = local.task_public_ip
      }
    }

    input = jsonencode({
      containerOverrides = [{ name = "api", command = ["python", "manage.py", "purge_deleted_accounts"] }]
    })
  }
}

# ---------------------------------------------------------------- GitHub Actions deploy role (OIDC, no stored keys)

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_github_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  github_oidc_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Only jobs running in this repo's GitHub Environment (which can require approval).
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:environment:${var.github_environment}"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "${local.name}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}

resource "aws_iam_role_policy" "github_deploy" {
  role = aws_iam_role.github_deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken", "ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition", "ecs:DescribeTasks"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:CompleteLayerUpload",
          "ecr:GetDownloadUrlForLayer", "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart",
        ]
        Resource = [for r in aws_ecr_repository.app : r.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["ecs:UpdateService", "ecs:DescribeServices"]
        Resource = [for s in aws_ecs_service.app : s.id]
      },
      {
        Effect    = "Allow"
        Action    = ["ecs:RunTask"]
        Resource  = "${aws_ecs_task_definition.api.arn_without_revision}:*"
        Condition = { ArnLike = { "ecs:cluster" = aws_ecs_cluster.main.arn } }
      },
      {
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [aws_iam_role.execution.arn, aws_iam_role.api_task.arn]
      },
    ]
  })
}

# Read-only role for `terraform plan` on pull requests (.github/workflows/terraform.yml).
data "aws_iam_policy_document" "github_plan_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:pull_request"]
    }
  }
}

resource "aws_iam_role" "github_plan" {
  count              = var.plan_state_bucket == "" ? 0 : 1
  name               = "${local.name}-github-plan"
  assume_role_policy = data.aws_iam_policy_document.github_plan_assume.json
}

resource "aws_iam_role_policy_attachment" "github_plan_readonly" {
  count      = length(aws_iam_role.github_plan)
  role       = aws_iam_role.github_plan[0].name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "github_plan" {
  count = length(aws_iam_role.github_plan)
  role  = aws_iam_role.github_plan[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { # read state (plan runs with -lock=false, so no writes)
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:ListBucket"]
        Resource = ["arn:aws:s3:::${var.plan_state_bucket}", "arn:aws:s3:::${var.plan_state_bucket}/*"]
      },
      { # refreshing aws_secretsmanager_secret_version reads it
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.app.arn
      },
    ]
  })
}
