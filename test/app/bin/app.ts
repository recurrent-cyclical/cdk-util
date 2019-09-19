#!/usr/bin/env node
import cdk = require('@aws-cdk/core');
import 'source-map-support/register';
import { CdkProjectConfig } from '../../../src/configurator';
import { AppStack } from '../lib/app-stack';

// let config = new Config({ cwd: process.cwd() });
const config = new CdkProjectConfig({ cwd: process.cwd() });

console.log(config.getConfig());
const region = config.get('region');
const sourceRegion = config.get('sourceRegion');
const sourceBucket = config.get('sourceBucket');
const project = config.get('project');
const applicationName = config.get('applicationName');
const version = process.env.CFN_VERSION;

const accountMaps = config.get('accountMaps');

const app = new cdk.App();
const stackName = 'AppStack'
const appStack = new AppStack(app, stackName, { accountMaps });
appStack.templateOptions.description = `${project}/${applicationName} - ${stackName} - ${version}`;
// accountStack.templateOptions.transform = 'AWS::Serverless';
appStack.templateOptions.metadata = {
  stackName,
  project,
  applicationName,
  version,
  sourceBucket,
  sourceRegion,
};