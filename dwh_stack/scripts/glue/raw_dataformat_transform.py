import sys
import logging
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job

from awsglue.dynamicframe import DynamicFrame
from pyspark.sql import functions as F
from pyspark.sql.types import *
from datetime import datetime
from pyspark.conf import SparkConf  
# ロギング設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)



args = getResolvedOptions(sys.argv, [
    'JOB_NAME', 
    'SOURCE_DATABASE', 
    'RAW_BUCKET',
    'PROCESSED_BUCKET',
    'TARGET_DATABSE'
])

warehouse=args["RAW_BUCKET"]
region = "ap-northeast-1"  
logger.info(f"使用するwarehouse: {warehouse}")
# # Spark設定 - Icebergサポートを有効化
conf = SparkConf()
conf.set("spark.sql.catalog.s3tablesbucket", "org.apache.iceberg.spark.SparkCatalog")
conf.set("spark.sql.catalog.s3tablesbucket.catalog-impl", "software.amazon.s3tables.iceberg.S3TablesCatalog")
conf.set("spark.sql.catalog.s3tablesbucket.warehouse", warehouse)
conf.set("spark.sql.catalog.glue_catalog.io-impl","org.apache.iceberg.aws.s3.S3FileIO")
conf.set("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
# S3 Tables固有の設定
conf.set("spark.sql.catalog.s3tablesbucket.s3tables.enabled", "true")
conf.set("spark.sql.catalog.s3tablesbucket.s3tables.region", region)
# S3 Tablesの名前空間とテーブル名を設定
# conf.set("spark.sql.catalog.s3tablesbucket.glue.database-namespace", "isp_master")
# conf.set("spark.sql.catalog.s3tablesbucket.glue.table-namespace", "tsna01")



# これは何をしているか;
# DMS -> s3 -> crawler -> catalog(s3) -> this -> catalog (s3tables)
# dataformatだけ変えている




import boto3
gluecatalogname=args['SOURCE_DATABASE']
target_databse_name=args['TARGET_DATABASE']

glue_client = boto3.client('glue')
# データベース内のテーブル一覧を取得
response = glue_client.get_tables(DatabaseName=gluecatalogname)
table_names = [table['Name'] for table in response['TableList']]
logger.info(f"Processing tables: {table_names}")


sparkContext = SparkContext(conf=conf)
glueContext = GlueContext(sparkContext)
job = Job(glueContext)
job.init(args['JOB_NAME'], args)
spark = glueContext.spark_session

spark.sql( """ CREATE NAMESPACE IF NOT EXISTS s3tablesbucket.raw_data""")    

# 現在の日付を取得（パーティション用）
current_date = datetime.now()
year = current_date.strftime("%Y")
month = current_date.strftime("%m")
day = current_date.strftime("%d")


logger.info(f"Processing tables: {table_names}")

# 各テーブルを処理
error=None
for table_name in table_names:
    try:
        logger.info(f"Processing table: {table_name}")
        
        # データカタログからテーブルを読み込み
        datasource = glueContext.create_dynamic_frame.from_catalog(
            database=gluecatalogname,
            table_name=table_name
        )
        
        if datasource.count() > 0:
            # スキーマ情報を取得
            schema = datasource.schema()
            logger.info(f"Schema for {table_name}: {schema}")
            
            # データフレームに変換
            df = datasource.toDF()
            
            # Icebergテーブルとして保存
            df.createOrReplaceTempView(f"temp_{table_name}")
            
            # TODO:テーブルがなかったら作成、ある場合はマージがしたい
            # Icebergテーブル作成
            
            table_exists = len(self.spark.sql(f"SHOW TABLES IN s3tablesbucket.{target_database_name} LIKE ic_{table_name.removeprefix("raw_")}").collect()) > 0
            if table_exists:
                insert_sql = f"""
                INSERT INTO s3tablesbucket.{target_database_name}.ic_{table_name.removeprefix("raw_")}
                SELECT * FROM temp_{table_name}
                """
                spark.sql(insert_sql)
                    
            else:
                spark.sql(f"""
                CREATE TABLE IF NOT EXISTS s3tablesbucket.{target_databse_name}.ic_{table_name.removeprefix("raw_")}
                USING iceberg
                TBLPROPERTIES (
                        'write.format.default' = 'parquet',
                        'write.parquet.compression-codec' = 'snappy',
                        'write.distribution-mode' = 'hash',
                        'format-version' = '2',
                        'write.metadata.delete-after-commit.enabled' = 'true',
                        'write.metadata.previous-versions-max' = '10'
                    )
                    
                AS SELECT * FROM temp_{table_name}
                """)
            
            
            
            
    except Exception as e:
        logger.error(f"Error processing table {table_name}: {str(e)}")
        error=e
        continue
if error != None:
    raise error
        
job.commit()