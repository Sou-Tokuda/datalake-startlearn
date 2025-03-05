export interface AppConfig {
    projectName: string;
    environment: string;
    vpc: {
      maxAzs: number;
      natGateways: number;
    };
    rds: {
      mssql: {
        instanceType: string;
        allocatedStorage: number;
        backupRetention: number;
        databaseName: string;
      };
      aurora: {
        instanceType: string;
        instances: number;
        databaseName: string;
      };
    };
    dms: {
      instanceType: string;
    };
    glue: {
      workerType: string;
      numberOfWorkers: number;
      timeout: number;
    };
  }
  
  // 最小コスト構成の設定
  export const devConfig: AppConfig = {
    projectName: 'DataPipeline',
    environment: 'dev',
    vpc: {
      maxAzs: 2,
      natGateways: 1,
    },
    rds: {
      mssql: {
        instanceType: 't3.micro',
        allocatedStorage: 20,
        backupRetention: 1,
        databaseName: 'mssqldb',
      },
      aurora: {
        instanceType: 't3.small',
        instances: 1,
        databaseName: 'auroradb',
      },
    },
    dms: {
      instanceType: 't3.micro', // 最小インスタンス
    },
    glue: {
      workerType: 'G.1X',
      numberOfWorkers: 2,
      timeout: 30,
    },
  };
  
  // 環境に応じた設定を取得する関数
  export function getConfig(): AppConfig {
    const env = process.env.CDK_ENV || 'dev';
    
    switch (env) {
      case 'dev':
        return devConfig;
      default:
        return devConfig;
    }
  }