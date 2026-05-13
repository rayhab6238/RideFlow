CREATE TABLE IF NOT EXISTS Users (
    User_ID INT AUTO_INCREMENT PRIMARY KEY,
    FullName VARCHAR(100) NOT NULL,
    Password_Hash VARCHAR(255) NOT NULL,
    Account_Status ENUM('Active', 'Suspended', 'Banned')
        DEFAULT 'Active',
    Role ENUM('Admin', 'Rider', 'Driver') NOT NULL,
    Registration_Date DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS User_Phone (
    Phone_ID INT AUTO_INCREMENT PRIMARY KEY,
    User_ID INT NOT NULL,
    Phone_Number VARCHAR(15) NOT NULL UNIQUE,

    FOREIGN KEY (User_ID)
    REFERENCES Users(User_ID)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS User_Email (
    Email_ID INT AUTO_INCREMENT PRIMARY KEY,
    User_ID INT NOT NULL,
    Email VARCHAR(100) NOT NULL UNIQUE,

    FOREIGN KEY (User_ID)
    REFERENCES Users(User_ID)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Rider (
    Rider_ID INT AUTO_INCREMENT PRIMARY KEY,
    User_ID INT NOT NULL UNIQUE,

    FOREIGN KEY (User_ID)
    REFERENCES Users(User_ID)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Driver (
    Driver_ID INT AUTO_INCREMENT PRIMARY KEY,
    User_ID INT NOT NULL UNIQUE,

    CNIC VARCHAR(15) NOT NULL UNIQUE,
    License_Number VARCHAR(50) NOT NULL UNIQUE,

    Profile_Photo VARCHAR(255),

    Verif_Status ENUM('Pending', 'Verified', 'Rejected')
        DEFAULT 'Pending',

    Availability_Status ENUM('Online', 'Offline', 'On Trip')
        DEFAULT 'Offline',

    Avg_Rating DECIMAL(3,2)
        DEFAULT 0
        CHECK (Avg_Rating BETWEEN 0 AND 5),

    Total_Trips INT
        DEFAULT 0
        CHECK (Total_Trips >= 0),

    FOREIGN KEY (User_ID)
    REFERENCES Users(User_ID)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Vehicle (
    Vehicle_ID INT AUTO_INCREMENT PRIMARY KEY,

    Driver_ID INT NOT NULL,

    Make VARCHAR(50) NOT NULL,
    Model VARCHAR(50) NOT NULL,

    Vehicle_Year INT
        CHECK (Vehicle_Year >= 2000),

    Color VARCHAR(20),

    License_Plate VARCHAR(20) NOT NULL UNIQUE,

    Vehicle_Type ENUM('Economy','Premium','Bike')
        NOT NULL,

    Verification_Status ENUM('Pending','Verified','Rejected')
        DEFAULT 'Pending',

    FOREIGN KEY (Driver_ID)
    REFERENCES Driver(Driver_ID)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Location (
    Location_ID INT AUTO_INCREMENT PRIMARY KEY,

    City VARCHAR(50) NOT NULL,
    Street VARCHAR(100),
    HouseNo VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS Ride (
    Ride_ID INT AUTO_INCREMENT PRIMARY KEY,

    Rider_ID INT NOT NULL,
    Driver_ID INT,
    Vehicle_ID INT,

    Pickup_ID INT NOT NULL,
    Dropoff_ID INT NOT NULL,

    Fare DECIMAL(10,2)
        CHECK (Fare >= 0),

    Distance_KM DECIMAL(6,2),

    Duration_Minutes INT,

    Ride_Status ENUM(
        'Requested',
        'Accepted',
        'EnRoute',
        'InProgress',
        'Completed',
        'Cancelled'
    ) NOT NULL,

    Request_Time DATETIME DEFAULT CURRENT_TIMESTAMP,

    Scheduled_Time DATETIME,
    Start_Time DATETIME,
    End_Time DATETIME,

    FOREIGN KEY (Rider_ID)
    REFERENCES Rider(Rider_ID),

    FOREIGN KEY (Driver_ID)
    REFERENCES Driver(Driver_ID),

    FOREIGN KEY (Vehicle_ID)
    REFERENCES Vehicle(Vehicle_ID),

    FOREIGN KEY (Pickup_ID)
    REFERENCES Location(Location_ID),

    FOREIGN KEY (Dropoff_ID)
    REFERENCES Location(Location_ID)
);

CREATE TABLE IF NOT EXISTS Payment (
    Payment_ID INT AUTO_INCREMENT PRIMARY KEY,

    Ride_ID INT NOT NULL UNIQUE,
    Rider_ID INT NOT NULL,

    Amount DECIMAL(10,2) NOT NULL
        CHECK (Amount >= 0),

    Payment_Method ENUM('Cash', 'Wallet', 'Card')
        NOT NULL,

    Payment_Status ENUM(
        'Pending',
        'Paid',
        'Failed',
        'Refunded'
    ) DEFAULT 'Pending',

    Transaction_Date DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (Ride_ID)
    REFERENCES Ride(Ride_ID),

    FOREIGN KEY (Rider_ID)
    REFERENCES Rider(Rider_ID)
);

CREATE TABLE IF NOT EXISTS PromoCode (
    Promo_ID INT AUTO_INCREMENT PRIMARY KEY,

    Code VARCHAR(50) NOT NULL UNIQUE,

    Discount DECIMAL(5,2)
        CHECK (Discount >= 0),

    Expiry_Date DATE,

    Usage_Count INT DEFAULT 0,

    Max_Usage INT,

    Status ENUM('Active','Expired')
        DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS Payment_Promo (
    Payment_ID INT,
    Promo_ID INT,

    PRIMARY KEY (Payment_ID, Promo_ID),

    FOREIGN KEY (Payment_ID)
    REFERENCES Payment(Payment_ID)
    ON DELETE CASCADE,

    FOREIGN KEY (Promo_ID)
    REFERENCES PromoCode(Promo_ID)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Rating (
    Rating_ID INT AUTO_INCREMENT PRIMARY KEY,

    Ride_ID INT NOT NULL,

    Rated_By ENUM('Rider', 'Driver')
        NOT NULL,

    Rated_User_ID INT NOT NULL,

    Score INT NOT NULL
        CHECK (Score BETWEEN 1 AND 5),

    Comment TEXT,

    Timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (Ride_ID)
    REFERENCES Ride(Ride_ID)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Complaint (
    Complaint_ID INT AUTO_INCREMENT PRIMARY KEY,

    Ride_ID INT NOT NULL,

    Comment TEXT NOT NULL,

    Complaint_Status ENUM('Open','Resolved')
        DEFAULT 'Open',

    Created_At DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (Ride_ID)
    REFERENCES Ride(Ride_ID)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Ride_History (
    History_ID INT AUTO_INCREMENT PRIMARY KEY,

    Ride_ID INT,
    Rider_ID INT,
    Driver_ID INT,

    Final_Status VARCHAR(20),

    Archived_At DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- admin notification table

CREATE TABLE IF NOT EXISTS Admin_Notifications (
    Notification_ID INT AUTO_INCREMENT PRIMARY KEY,

    Driver_ID INT,

    Message TEXT NOT NULL,

    Created_At DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (Driver_ID)
    REFERENCES Driver(Driver_ID)
    ON DELETE CASCADE
);

-- fare rules table
CREATE TABLE IF NOT EXISTS FareRules (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    Base_Rate DECIMAL(10,2) NOT NULL DEFAULT 150,
    Per_KM_Rate DECIMAL(10,2) NOT NULL DEFAULT 40,
    Per_Min_Rate DECIMAL(10,2) NOT NULL DEFAULT 5,
    Updated_At DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
