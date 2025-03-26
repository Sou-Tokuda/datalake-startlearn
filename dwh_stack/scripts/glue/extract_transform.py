
import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job
from awsglue.dynamicframe import DynamicFrame
from pyspark.sql import functions as F
from pyspark.sql.types import *
from datetime import datetime

import boto3
glue_client = boto3.client('glue')

# パラメータの取得
args = getResolvedOptions(sys.argv, [
    'JOB_NAME', 
    'SOURCE_DATABASE', 
    'RAW_BUCKET',
    'PROCESSED_BUCKET'
])

# Spark/Glueコンテキストの初期化
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args['JOB_NAME'], args)

# 現在の日付を取得（パーティション用）
current_date = datetime.now()
year = current_date.strftime("%Y")
month = current_date.strftime("%m")
day = current_date.strftime("%d")

# データカタログからテーブル一覧を取得
database = args['SOURCE_DATABASE']
# データベース内のテーブル一覧を取得
response = glue_client.get_tables(DatabaseName=database)
table_names = [table['Name'] for table in response['TableList']]
print(f"Processing tables: {table_names}")

# 各テーブルを処理
for table_name in table_names:
    try:
        print(f"Processing table: {table_name}")
        
        # データカタログからテーブルを読み込み
        datasource = glueContext.create_dynamic_frame.from_catalog(
            database=database,
            table_name=table_name
        )
        
        if datasource.count() > 0:
            # スキーマ情報を取得
            schema = datasource.schema()
            print(f"Schema for {table_name}: {schema}")
            
            # データフレームに変換
            df = datasource.toDF()
            
            # データクレンジングと変換
            # 1. タイムスタンプ列の標準化
            timestamp_cols = [field.name for field in schema.fields if isinstance(field.dataType, TimestampType)]
            for col in timestamp_cols:
                df = df.withColumn(col, F.date_format(F.col(col), "yyyy-MM-dd HH:mm:ss"))
            
            # 2. 文字列の空白トリム
            string_cols = [field.name for field in schema.fields if isinstance(field.dataType, StringType)]
            for col in string_cols:
                df = df.withColumn(col, F.trim(F.col(col)))
            
            # 3. 処理メタデータの追加
            df = df.withColumn("etl_processed_at", F.lit(datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
            df = df.withColumn("source_table", F.lit(table_name))
            df = df.withColumn("batch_id", F.lit(f"{year}{month}{day}"))
            
            # 4. データ品質チェック（例：NULLチェック、重複チェックなど）
            # 重複行の削除
            df = df.dropDuplicates()
            
            # 5. パーティション列の追加
            df = df.withColumn("year", F.lit(year))
            df = df.withColumn("month", F.lit(month))
            df = df.withColumn("day", F.lit(day))
            
            # 処理済みデータをS3に書き込み（Parquet形式）
            output_path = f"s3://{args['PROCESSED_BUCKET']}/processed/{table_name}/"
            
            print(f"Writing processed data to {output_path}")
            
            # DynamicFrameに戻して書き込み
            processed_dyf = DynamicFrame.fromDF(df, glueContext, f"processed_{table_name}")
            
            glueContext.write_dynamic_frame.from_options(
                frame=processed_dyf,
                connection_type="s3",
                connection_options={
                    "path": output_path,
                    "partitionKeys": ["year", "month", "day"]
                },
                format="parquet"
            )
            
            print(f"Successfully processed table: {table_name}")
        else:
            print(f"Table {table_name} is empty, skipping")
    
    except Exception as e:
        print(f"Error processing table {table_name}: {str(e)}")
        continue

# ジョブの完了
job.commit()