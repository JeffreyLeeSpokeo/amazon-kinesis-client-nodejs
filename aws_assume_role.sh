#!/bin/bash
###############################################################
# AWS CLI Assume Role with MAF
#
# This script simplifies the process of assuming a role in AWS
# with an MFA device.  This will set the environment variables
# with the STS tokens for your temporary access using your
# assumed role.
#
# Input:
#   $1: IAM username
#   $2: account name (production, qa, sandbox)
#   $3: role (Developer, Backend, Devops, etc...)
#   $4: MFA token (look this up from your MFA device)
#   $5: AWS region (defaults to us-west-2)
#

username=$1
account_name=$2
role=$3
mfa_secret=$4
region=$5

unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
unset AWS_SESSION_TOKEN

if [ -z "$1" ]; then
  echo "No username given.  Exiting"
  return
fi
if [ -z "$5" ]; then
  region="us-west-2"
fi

# validate account name
master_account_id=403842876028
account_id=0
case "$2" in
  "production") account_id=793125453184
                ;;
  "qa")         account_id=820604880046
                ;;
  *)            account_id=322962807964
                account_name="sandbox"
                ;;
esac

values=$(aws sts assume-role --role-arn arn:aws:iam::${account_id}:role/${role} --role-session-name "${account_name}-${role}" --serial-number arn:aws:iam::${master_account_id}:mfa/${username} --token-code ${mfa_secret} | jq '.Credentials | .AccessKeyId + " " + .SecretAccessKey + " " + .SessionToken' | sed -e 's/"//g')

export AWS_ACCESS_KEY_ID=$(echo ${values} | awk '{print $1}')
export AWS_SECRET_ACCESS_KEY=$(echo ${values} | awk '{print $2}')
export AWS_SESSION_TOKEN=$(echo ${values} | awk '{print $3}')
export AWS_DEFAULT_REGION=${region}
