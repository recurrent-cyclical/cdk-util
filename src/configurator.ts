import fs = require('fs');
import yaml = require('js-yaml');
import path = require('path');
import cdkLogger = require('./cdk-logger');

// import * as fs from 'fs';

export interface CdkProjectConfigProps {
  region: string;
  project: string;
  applicationName: string;
  sourceRegion: string;
  sourceBucket: string;
}

export class CdkProjectConfig {
  public readonly config: any; // : CdkProjectConfigProps
  public readonly properties: any;
  private logger: cdkLogger.CdkLogger;

  constructor(properties: any) {
    this.properties = properties;
    this.logger = new cdkLogger.CdkLogger();
    this.config = this.readFilesSync(`${this.properties.cwd}/config/`);
    this.logger.log(this.config);
    this.logger.log(this.config.region)
    const keys = ['region', 'project', 'applicationName', 'sourceRegion', 'sourceBucket'];
    let raiseError = false;
    const missing = [];
    for (const key of keys) {
      if (this.config[key] == null) {
        raiseError = true;
        missing.push(key);
      }
    }
    if (raiseError) {
      const errMsg = missing.join(', ') + ' missing from config';
      throw Error(errMsg);
    }
  }

  public getConfig(): CdkProjectConfigProps {
    return this.config;
  }

  public get(name: string): any {
    return this.config[name];
  }

  private readFilesSync(dir: string): any {
    let config: any = {};
    if (!fs.existsSync(dir)) {
      this.logger.log('help!!!!! no config dir');
      this.logger.error('also help');
      throw Error('No config dir at:' + dir);
    }
    // assumption that this is natural sort - ie. alphanumeric order
    fs.readdirSync(dir).forEach((filename: string) => {
      const name = path.parse(filename).name;
      const ext = path.parse(filename).ext;
      const filepath = path.resolve(dir, filename);
      // TODO: validation on file path - isfile? isyaml?
      if (ext === '.yml' || ext === '.yaml') {
        const temp = yaml.safeLoad(fs.readFileSync(`${this.properties.cwd}/config/${name}${ext}`, 'utf8'));
        config = { ...config, ...temp };
      }
    });

    return config;
  }
}
