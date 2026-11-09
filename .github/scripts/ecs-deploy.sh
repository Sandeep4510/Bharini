#!/usr/bin/env bash
# ECS deploy steps shared by the api and web jobs in deploy.yml. Needs CLUSTER in the env.
#   ecs-deploy.sh register <service> <image>   -> prints the new task-definition ARN
#   ecs-deploy.sh migrate  <task-def-arn>      -> runs `manage.py migrate` once, fails on non-zero exit
#   ecs-deploy.sh rollout  <service> <task-def-arn>
set -euo pipefail
: "${CLUSTER:?CLUSTER is required}"

register() { # start from the latest revision (Terraform's env + secrets), swap in the new image
  local svc=$1 image=$2
  aws ecs describe-task-definition --task-definition "$CLUSTER-$svc" --query taskDefinition \
    | jq --arg name "$svc" --arg image "$image" '
        .containerDefinitions |= map(if .name == $name then .image = $image else . end)
        | del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
              .compatibilities, .registeredAt, .registeredBy)' > "/tmp/td-$svc.json"
  aws ecs register-task-definition --cli-input-json "file:///tmp/td-$svc.json" \
    --query taskDefinition.taskDefinitionArn --output text
}

migrate() {
  local td=$1 net task code
  net=$(aws ecs describe-services --cluster "$CLUSTER" --services api \
        --query 'services[0].networkConfiguration' --output json)
  task=$(aws ecs run-task --cluster "$CLUSTER" --launch-type FARGATE --task-definition "$td" \
         --network-configuration "$net" \
         --overrides '{"containerOverrides":[{"name":"api","command":["python","manage.py","migrate","--noinput"]}]}' \
         --query 'tasks[0].taskArn' --output text)
  echo "Migration task: $task" >&2
  aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$task"
  code=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$task" \
         --query 'tasks[0].containers[0].exitCode' --output text)
  if [ "$code" != "0" ]; then
    echo "::error::migrate exited with $code. Logs: CloudWatch /ecs/$CLUSTER/api"
    exit 1
  fi
}

rollout() {
  local svc=$1 td=$2 got
  aws ecs update-service --cluster "$CLUSTER" --service "$svc" --task-definition "$td" >/dev/null
  aws ecs wait services-stable --cluster "$CLUSTER" --services "$svc"
  # The circuit breaker may have rolled back to the old revision; that is a failed deploy.
  got=$(aws ecs describe-services --cluster "$CLUSTER" --services "$svc" \
        --query 'services[0].deployments[?status==`PRIMARY`].taskDefinition | [0]' --output text)
  if [ "$got" != "$td" ]; then
    echo "::error::$svc rolled back to $got"
    exit 1
  fi
}

"$@"
