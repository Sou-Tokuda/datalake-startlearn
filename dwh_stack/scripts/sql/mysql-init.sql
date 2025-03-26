
 call mysql.rds_set_configuration('binlog retention hours', 24);
                    
                
USE auroradb;

-- 従業員テーブルの作成
CREATE TABLE IF NOT EXISTS employees (
    employee_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20),
    hire_date DATE NOT NULL,
    job_title VARCHAR(100) NOT NULL,
    department VARCHAR(50) NOT NULL,
    salary DECIMAL(10, 2) NOT NULL,
    manager_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_department (department),
    INDEX idx_job_title (job_title)
);

-- 部門テーブルの作成
CREATE TABLE IF NOT EXISTS departments (
    department_id INT AUTO_INCREMENT PRIMARY KEY,
    department_name VARCHAR(50) NOT NULL,
    location VARCHAR(100),
    budget DECIMAL(15, 2),
    manager_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- プロジェクトテーブルの作成
CREATE TABLE IF NOT EXISTS projects (
    project_id INT AUTO_INCREMENT PRIMARY KEY,
    project_name VARCHAR(100) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    status ENUM('planning', 'in_progress', 'completed', 'on_hold', 'cancelled') DEFAULT 'planning',
    budget DECIMAL(15, 2),
    department_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(department_id)
);

-- プロジェクト割り当てテーブルの作成
CREATE TABLE IF NOT EXISTS project_assignments (
    assignment_id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    employee_id INT NOT NULL,
    role VARCHAR(50) NOT NULL,
    assigned_date DATE NOT NULL,
    hours_allocated INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(project_id),
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
    UNIQUE KEY unique_assignment (project_id, employee_id)
);

-- サンプルデータの挿入
-- 部門データ
INSERT INTO departments (department_name, location, budget) VALUES
    ('Engineering', 'Building A, Floor 2', 1500000.00),
    ('Marketing', 'Building B, Floor 1', 750000.00),
    ('Human Resources', 'Building A, Floor 1', 500000.00),
    ('Finance', 'Building C, Floor 3', 1000000.00),
    ('Sales', 'Building B, Floor 2', 1200000.00);

-- 従業員データ
INSERT INTO employees (first_name, last_name, email, phone, hire_date, job_title, department, salary) VALUES
    ('Michael', 'Johnson', 'michael.johnson@example.com', '123-456-7890', '2018-06-15', 'Senior Software Engineer', 'Engineering', 120000.00),
    ('Emily', 'Davis', 'emily.davis@example.com', '234-567-8901', '2019-03-22', 'Marketing Manager', 'Marketing', 95000.00),
    ('David', 'Wilson', 'david.wilson@example.com', '345-678-9012', '2017-11-08', 'HR Director', 'Human Resources', 110000.00),
    ('Sarah', 'Anderson', 'sarah.anderson@example.com', '456-789-0123', '2020-01-15', 'Financial Analyst', 'Finance', 85000.00),
    ('James', 'Taylor', 'james.taylor@example.com', '567-890-1234', '2018-09-30', 'Sales Director', 'Sales', 115000.00),
    ('Jennifer', 'Thomas', 'jennifer.thomas@example.com', '678-901-2345', '2019-07-12', 'Software Engineer', 'Engineering', 90000.00),
    ('Robert', 'Clark', 'robert.clark@example.com', '789-012-3456', '2020-02-28', 'Marketing Specialist', 'Marketing', 75000.00),
    ('Lisa', 'Walker', 'lisa.walker@example.com', '890-123-4567', '2018-04-17', 'HR Specialist', 'Human Resources', 70000.00),
    ('Daniel', 'Lewis', 'daniel.lewis@example.com', '901-234-5678', '2019-10-05', 'Senior Accountant', 'Finance', 95000.00),
    ('Michelle', 'Harris', 'michelle.harris@example.com', '012-345-6789', '2017-08-22', 'Sales Representative', 'Sales', 80000.00);

-- プロジェクトデータ
INSERT INTO projects (project_name, description, start_date, end_date, status, budget, department_id) VALUES
    ('Website Redesign', 'Redesign company website with modern UI/UX', '2023-01-15', '2023-06-30', 'in_progress', 250000.00, 1),
    ('Q2 Marketing Campaign', 'Launch marketing campaign for Q2 products', '2023-03-01', '2023-06-30', 'in_progress', 150000.00, 2),
    ('Employee Benefits Update', 'Review and update employee benefits package', '2023-02-15', '2023-04-30', 'completed', 50000.00, 3),
    ('Financial Reporting System', 'Implement new financial reporting system', '2023-04-01', '2023-09-30', 'planning', 300000.00, 4),
    ('Sales Training Program', 'Develop and launch sales training program', '2023-03-15', '2023-07-31', 'in_progress', 100000.00, 5);

-- プロジェクト割り当てデータ
INSERT INTO project_assignments (project_id, employee_id, role, assigned_date, hours_allocated) VALUES
    (1, 1, 'Project Lead', '2023-01-15', 120),
    (1, 6, 'Developer', '2023-01-20', 160),
    (2, 2, 'Project Manager', '2023-03-01', 100),
    (2, 7, 'Marketing Specialist', '2023-03-05', 120),
    (3, 3, 'Project Lead', '2023-02-15', 80),
    (3, 8, 'HR Specialist', '2023-02-20', 100),
    (4, 4, 'Project Manager', '2023-04-01', 120),
    (4, 9, 'Financial Analyst', '2023-04-05', 160),
    (5, 5, 'Project Lead', '2023-03-15', 100),
    (5, 10, 'Sales Trainer', '2023-03-20', 120);