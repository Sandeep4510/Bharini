# prod environment. Its own AWS account; see infra/README.md for first-time setup.
terraform {
  required_version = ">= 1.10"
  # Bucket is passed at init: terraform init -backend-config="bucket=<state bucket>"
  backend "s3" {
    key          = "prod/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

locals {
  tags = { Project = "bharini", Environment = "prod", ManagedBy = "terraform" }
}

provider "aws" {
  region = "ap-south-1"
  default_tags {
    tags = local.tags
  }
}

provider "aws" {
  alias  = "us_east_1" # CloudFront certificates
  region = "us-east-1"
  default_tags {
    tags = local.tags
  }
}

module "app" {
  source    = "../../modules/app"
  providers = { aws = aws, aws.us_east_1 = aws.us_east_1 }

  env                = "prod"
  zone_name          = "bharini.com"
  domain             = "bharini.com"
  api_domain         = "api.bharini.com"
  media_domain       = "media.bharini.com"
  github_environment = "production"
  lean               = false
  high_availability  = false # TODO: true before public launch (Multi-AZ RDS, NAT per AZ)
  # plan_state_bucket = "bharini-tfstate-<account id>"  # enables PR plans
  db_instance_class = "db.t4g.small"
  api_count         = 2
  api_max_count     = 6
  web_count         = 2
}

output "app" {
  value = module.app
}
