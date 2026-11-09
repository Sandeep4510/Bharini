# staging environment. Its own AWS account; see infra/README.md for first-time setup.
terraform {
  required_version = ">= 1.10"
  # Bucket is passed at init: terraform init -backend-config="bucket=<state bucket>"
  backend "s3" {
    key          = "staging/terraform.tfstate"
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
  tags = { Project = "bharini", Environment = "staging", ManagedBy = "terraform" }
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

  env                = "staging"
  zone_name          = "staging.bharini.com"
  domain             = "staging.bharini.com"
  api_domain         = "api.staging.bharini.com"
  media_domain       = "media.staging.bharini.com"
  github_environment = "staging"
  lean               = true # ~$65/mo cheaper; see modules/app/variables.tf
  # plan_state_bucket = "bharini-tfstate-<account id>"  # enables PR plans

}

output "app" {
  value = module.app
}
