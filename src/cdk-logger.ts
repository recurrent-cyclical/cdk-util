import pino = require('pino');

interface CdkLoggerProps {
  logFilePath?: string;
  timestampFormat?: string;
}

export class CdkLogger {
  public readonly cdkLoggerProps: CdkLoggerProps;
  private pinoLogger: pino.Logger;
  // public readonly bunyan: bunyan;

  constructor(props: CdkLoggerProps = {}) {
    this.cdkLoggerProps = props;
    this.pinoLogger = pino();
  }

  public log(message: any): void {
    this.pinoLogger.info(message);
  }

  public error(message: any): void {
    this.pinoLogger.error(message);
  }
}
