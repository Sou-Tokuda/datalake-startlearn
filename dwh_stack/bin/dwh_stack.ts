#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MyStack } from '../lib/dwh_stack-stack';

const app = new cdk.App();

// 環境変数から環境名を取得（デフォルトはdev）
const envName = process.env.CDK_ENV || 'dev';

new MyStack(app, `MinimalCost-${envName}-Stack`, {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1'
  },
  description: `最小コストで構築されたインフラストラクチャ (${envName}環境)`,
});
cdk.Tags.of(app).add("Owner","Sou.Tokuda@sony.com")
app.synth();