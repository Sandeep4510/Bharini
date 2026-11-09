variable "env" {
  description = "Environment name: staging or prod."
  type        = string
  validation {
    condition     = contains(["staging", "prod"], var.env)
    error_message = "env must be staging or prod."
  }
}

variable "zone_name" {
  description = "Route 53 hosted zone that already exists in this account, e.g. bharini.com or staging.bharini.com."
  type        = string
}

variable "domain" {
  description = "Web app host, e.g. bharini.com."
  type        = string
}

variable "api_domain" {
  description = "API host, e.g. api.bharini.com."
  type        = string
}

variable "media_domain" {
  description = "CloudFront media host, e.g. media.bharini.com."
  type        = string
}

variable "github_repo" {
  description = "owner/name of the GitHub repo allowed to deploy."
  type        = string
  default     = "Sandeep4510/Bharini"
}

variable "github_environment" {
  description = "GitHub Environment whose OIDC tokens may assume the deploy role."
  type        = string
}

variable "create_github_oidc_provider" {
  description = "The GitHub OIDC provider exists once per AWS account. Set false if another stack already made it."
  type        = bool
  default     = true
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "web_cpu" {
  type    = number
  default = 256
}

variable "web_memory" {
  type    = number
  default = 512
}

variable "api_count" {
  description = "Minimum API tasks. Autoscaling goes up to api_max_count."
  type        = number
  default     = 1
}

variable "api_max_count" {
  type    = number
  default = 4
}

variable "web_count" {
  type    = number
  default = 1
}

variable "email" {
  description = "Non-secret SMTP settings. EMAIL_HOST_PASSWORD lives in the app secret."
  type        = map(string)
  default = {
    EMAIL_HOST         = "smtpout.secureserver.net"
    EMAIL_PORT         = "465"
    EMAIL_HOST_USER    = "admin@bharini.com"
    DEFAULT_FROM_EMAIL = "admin@bharini.com"
    EMAIL_USE_SSL      = "true"
    EMAIL_USE_TLS      = "false"
  }
}

variable "api_extra_env" {
  description = "Extra plain env vars for the API container."
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "lean" {
  description = <<-EOT
    Cheap mode for staging or pre-launch: no NAT gateway (tasks get public IPs, still only reachable
    through the ALB security group), no Redis (each API task keeps its own throttle counters),
    no WAF, no Container Insights. Saves roughly $65/month.
  EOT
  type        = bool
  default     = false
}

variable "high_availability" {
  description = "Multi-AZ RDS standby and one NAT per AZ (when not lean). Turn on before public launch."
  type        = bool
  default     = false
}

variable "plan_state_bucket" {
  description = "Terraform state bucket. When set, creates a read-only role that pull requests use for `terraform plan`."
  type        = string
  default     = ""
}
