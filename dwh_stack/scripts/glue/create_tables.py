
import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job
from awsglue.dynamicframe import DynamicFrame
from pyspark.sql import functions as F
from pyspark.sql.window import Window
import boto3
import os
from datetime import datetime

# パラメータの取得
args = getResolvedOptions(sys.argv, [
    'JOB_NAME', 
    'PROCESSED_BUCKET',
    'S3TABLES_BUCKET'
])

# Spark/Glueコンテキストの初期化
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args['JOB_NAME'], args)

# S3クライアントの初期化
s3 = boto3.client('s3')

# 処理済みデータのディレクトリを一覧
processed_bucket = args['PROCESSED_BUCKET']
s3tables_bucket = args['S3TABLES_BUCKET']

# 処理済みデータのプレフィックスを取得
response = s3.list_objects_v2(
    Bucket=processed_bucket,
    Prefix='processed/',
    Delimiter='/'
)

# 各テーブルディレクトリを処理
for prefix in response.get('CommonPrefixes', []):
    table_prefix = prefix.get('Prefix')
    table_name = table_prefix.split('/')[-2]  # 'processed/table_name/' から 'table_name' を抽出
    
    print(f"Processing table: {table_name}")
    
    try:
        # 処理済みデータを読み込み
        input_path = f"s3://{processed_bucket}/{table_prefix}"
        
        # Sparkで処理済みデータを読み込み
        df = spark.read.parquet(input_path)
        
        if df.count() > 0:
            # テーブルタイプに基づいて最適化を実行
            
            # 1. MSSQL由来のテーブル（顧客、製品、注文）
            if table_name in ['customers', 'products', 'orders']:
                # 分析用に最適化
                
                # 顧客テーブルの場合
                if table_name == 'customers':
                    # 名前を結合して表示名を作成
                    df = df.withColumn("full_name", F.concat(F.col("first_name"), F.lit(" "), F.col("last_name")))
                    
                    # 地域情報を整理
                    df = df.withColumn("location", 
                        F.concat(F.col("city"), F.lit(", "), F.col("state"), F.lit(", "), F.col("country")))
                
                # 製品テーブルの場合
                elif table_name == 'products':
                    # 在庫状況フラグを追加
                    df = df.withColumn("in_stock", F.when(F.col("stock_quantity") > 0, True).otherwise(False))
                    
                    # 価格帯カテゴリを追加
                    df = df.withColumn("price_category", 
                        F.when(F.col("price") < 100, "budget")
                         .when(F.col("price") < 500, "mid-range")
                         .when(F.col("price") < 1000, "premium")
                         .otherwise("luxury"))
                
                # 注文テーブルの場合
                elif table_name == 'orders':
                    # 注文日から年月を抽出
                    df = df.withColumn("order_year", F.year(F.col("order_date")))
                    df = df.withColumn("order_month", F.month(F.col("order_date")))
                    
                    # 配送先情報を整理
                    df = df.withColumn("shipping_location", 
                        F.concat(F.col("shipping_city"), F.lit(", "), F.col("shipping_state"), F.lit(", "), F.col("shipping_country")))
            
            # 2. Aurora由来のテーブル（従業員、部門、プロジェクト、プロジェクト割り当て）
            elif table_name in ['employees', 'departments', 'projects', 'project_assignments']:
                # 分析用に最適化
                
                # 従業員テーブルの場合
                if table_name == 'employees':
                    # 名前を結合して表示名を作成
                    df = df.withColumn("full_name", F.concat(F.col("first_name"), F.lit(" "), F.col("last_name")))
                    
                    # 勤続年数を計算
                    df = df.withColumn("years_of_service", 
                        F.floor(F.months_between(F.current_date(), F.col("hire_date")) / 12))
                    
                    # 給与帯カテゴリを追加
                    df = df.withColumn("salary_band", 
                        F.when(F.col("salary") < 70000, "entry")
                         .when(F.col("salary") < 90000, "mid-level")
                         .when(F.col("salary") < 110000, "senior")
                         .otherwise("executive"))
                
                # 部門テーブルの場合
                elif table_name == 'departments':
                    # 予算カテゴリを追加
                    df = df.withColumn("budget_category", 
                        F.when(F.col("budget") < 600000, "small")
                         .when(F.col("budget") < 1000000, "medium")
                         .otherwise("large"))
                
                # プロジェクトテーブルの場合
                elif table_name == 'projects':
                    # プロジェクト期間を計算（日数）
                    df = df.withColumn("project_duration_days", 
                        F.datediff(F.col("end_date"), F.col("start_date")))
                    
                    # 予算カテゴリを追加
                    df = df.withColumn("budget_category", 
                        F.when(F.col("budget") < 100000, "small")
                         .when(F.col("budget") < 200000, "medium")
                         .otherwise("large"))
                    
                    # 現在の状態を追加（進行中、完了、期限超過など）
                    df = df.withColumn("current_status", 
                        F.when(F.col("status") == "completed", "completed")
                         .when(F.col("end_date") < F.current_date(), "overdue")
                         .when(F.col("start_date") > F.current_date(), "not_started")
                         .otherwise("in_progress"))
                
                # プロジェクト割り当てテーブルの場合
                elif table_name == 'project_assignments':
                    # 割り当て期間を計算（現在日付からの経過日数）
                    df = df.withColumn("days_since_assignment", 
                        F.datediff(F.current_date(), F.col("assigned_date")))
            
            # 3. 共通の処理
            # 最終更新タイムスタンプを追加
            df = df.withColumn("s3tables_updated_at", F.current_timestamp())
            
            # パーティション最適化（必要に応じて）
            if "created_at" in df.columns:
                df = df.withColumn("created_year", F.year(F.col("created_at")))
                df = df.withColumn("created_month", F.month(F.col("created_at")))
            
            # S3 Tablesに書き込み
            output_path = f"s3://{s3tables_bucket}/tables/{table_name}/"
            
            print(f"Writing S3 Table to {output_path}")
            
            # Parquet形式で書き込み（S3 Tables用に最適化）
            df.write \
                .mode("overwrite") \
                .partitionBy("year", "month") \
                .option("compression", "snappy") \
                .parquet(output_path)
            
            # テーブルメタデータファイルを作成
            metadata = {
                "table_name": table_name,
                "source": "processed_data",
                "columns": [{"name": field.name, "type": str(field.dataType)} for field in df.schema.fields],
                "record_count": df.count(),
                "last_updated": datetime.now().isoformat(),
                "partitioning": ["year", "month"]
            }
            
            # メタデータをJSON形式で保存
            metadata_df = spark.createDataFrame([metadata])
            metadata_df.write \
                .mode("overwrite") \
                .json(f"s3://{s3tables_bucket}/metadata/{table_name}/")
            
            print(f"Successfully created S3 Table for: {table_name}")
        else:
            print(f"No data found for table {table_name}, skipping")
    
    except Exception as e:
        print(f"Error creating S3 Table for {table_name}: {str(e)}")
        continue

# ジョブの完了
job.commit()