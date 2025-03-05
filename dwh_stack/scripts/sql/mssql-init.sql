
-- MSSQL初期化スクリプト
USE [mssqldb];
GO

-- 顧客テーブルの作成
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[customers]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[customers](
        [customer_id] [int] IDENTITY(1,1) NOT NULL,
        [first_name] [nvarchar](50) NOT NULL,
        [last_name] [nvarchar](50) NOT NULL,
        [email] [nvarchar](100) NOT NULL,
        [phone] [nvarchar](20) NULL,
        [address] [nvarchar](200) NULL,
        [city] [nvarchar](50) NULL,
        [state] [nvarchar](50) NULL,
        [zip_code] [nvarchar](20) NULL,
        [country] [nvarchar](50) NULL,
        [created_at] [datetime] DEFAULT GETDATE(),
        [updated_at] [datetime] DEFAULT GETDATE(),
        CONSTRAINT [PK_customers] PRIMARY KEY CLUSTERED ([customer_id] ASC)
    );
END
GO

-- 製品テーブルの作成
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[products]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[products](
        [product_id] [int] IDENTITY(1,1) NOT NULL,
        [product_name] [nvarchar](100) NOT NULL,
        [description] [nvarchar](max) NULL,
        [category] [nvarchar](50) NULL,
        [price] [decimal](10, 2) NOT NULL,
        [stock_quantity] [int] NOT NULL DEFAULT 0,
        [created_at] [datetime] DEFAULT GETDATE(),
        [updated_at] [datetime] DEFAULT GETDATE(),
        CONSTRAINT [PK_products] PRIMARY KEY CLUSTERED ([product_id] ASC)
    );
END
GO

-- 注文テーブルの作成
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[orders]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[orders](
        [order_id] [int] IDENTITY(1,1) NOT NULL,
        [customer_id] [int] NOT NULL,
        [order_date] [datetime] NOT NULL DEFAULT GETDATE(),
        [total_amount] [decimal](10, 2) NOT NULL,
        [status] [nvarchar](20) NOT NULL DEFAULT 'pending',
        [shipping_address] [nvarchar](200) NULL,
        [shipping_city] [nvarchar](50) NULL,
        [shipping_state] [nvarchar](50) NULL,
        [shipping_zip_code] [nvarchar](20) NULL,
        [shipping_country] [nvarchar](50) NULL,
        [created_at] [datetime] DEFAULT GETDATE(),
        [updated_at] [datetime] DEFAULT GETDATE(),
        CONSTRAINT [PK_orders] PRIMARY KEY CLUSTERED ([order_id] ASC),
        CONSTRAINT [FK_orders_customers] FOREIGN KEY ([customer_id]) REFERENCES [dbo].[customers] ([customer_id])
    );
END
GO

-- サンプルデータの挿入
-- 顧客データ
INSERT INTO [dbo].[customers] ([first_name], [last_name], [email], [phone], [address], [city], [state], [zip_code], [country])
VALUES
    ('John', 'Doe', 'john.doe@example.com', '123-456-7890', '123 Main St', 'New York', 'NY', '10001', 'USA'),
    ('Jane', 'Smith', 'jane.smith@example.com', '234-567-8901', '456 Elm St', 'Los Angeles', 'CA', '90001', 'USA'),
    ('Bob', 'Johnson', 'bob.johnson@example.com', '345-678-9012', '789 Oak St', 'Chicago', 'IL', '60007', 'USA'),
    ('Alice', 'Williams', 'alice.williams@example.com', '456-789-0123', '321 Pine St', 'Houston', 'TX', '77001', 'USA'),
    ('Charlie', 'Brown', 'charlie.brown@example.com', '567-890-1234', '654 Maple St', 'Phoenix', 'AZ', '85001', 'USA');
GO

-- 製品データ
INSERT INTO [dbo].[products] ([product_name], [description], [category], [price], [stock_quantity])
VALUES
    ('Laptop', 'High-performance laptop with 16GB RAM', 'Electronics', 1299.99, 50),
    ('Smartphone', '5G smartphone with dual camera', 'Electronics', 799.99, 100),
    ('Desk Chair', 'Ergonomic office chair', 'Furniture', 249.99, 30),
    ('Coffee Maker', 'Programmable coffee maker with timer', 'Appliances', 89.99, 25),
    ('Bluetooth Speaker', 'Waterproof portable speaker', 'Electronics', 59.99, 75);
GO

-- 注文データ
INSERT INTO [dbo].[orders] ([customer_id], [order_date], [total_amount], [status], [shipping_address], [shipping_city], [shipping_state], [shipping_zip_code], [shipping_country])
VALUES
    (1, DATEADD(day, -10, GETDATE()), 1299.99, 'completed', '123 Main St', 'New York', 'NY', '10001', 'USA'),
    (2, DATEADD(day, -7, GETDATE()), 849.98, 'shipped', '456 Elm St', 'Los Angeles', 'CA', '90001', 'USA'),
    (3, DATEADD(day, -5, GETDATE()), 249.99, 'processing', '789 Oak St', 'Chicago', 'IL', '60007', 'USA'),
    (4, DATEADD(day, -3, GETDATE()), 149.98, 'pending', '321 Pine St', 'Houston', 'TX', '77001', 'USA'),
    (5, DATEADD(day, -1, GETDATE()), 59.99, 'pending', '654 Maple St', 'Phoenix', 'AZ', '85001', 'USA');
GO