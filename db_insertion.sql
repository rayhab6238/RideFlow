INSERT INTO Users
(FullName, Password_Hash, Account_Status, Role)
VALUES
('Ali Khan', 'hash1', 'Active', 'Rider'),
('Sara Ahmed', 'hash2', 'Active', 'Rider'),
('Usman Tariq', 'hash3', 'Active', 'Driver'),
('Hassan Raza', 'hash4', 'Active', 'Driver'),
('Admin One', 'hash5', 'Active', 'Admin');

INSERT INTO User_Phone
(User_ID, Phone_Number)
VALUES
(1, '03001234560'),
(1, '03011234566'),
(3, '03121234562'),
(4, '03211234564'),
(2, '03121234568'),
(5, '03331234567');

INSERT INTO User_Email
(User_ID, Email)
VALUES
(1, 'ali@gmail.com'),
(2, 'sara@gmail.com'),
(3, 'usman@gmail.com'),
(4, 'hassan@gmail.com'),
(5, 'admin@gmail.com');

INSERT INTO Rider (User_ID)
VALUES
(1),
(2);

INSERT INTO Driver (
    User_ID,
    CNIC,
    License_Number,
    Profile_Photo,
    Verif_Status,
    Availability_Status,
    Avg_Rating,
    Total_Trips
)
VALUES
(
    3,
    '37405-1234567-1',
    'LIC123',
    'photo1.jpg',
    'Verified',
    'Online',
    4.8,
    120
),
(
    4,
    '37405-9876543-1',
    'LIC456',
    'photo2.jpg',
    'Verified',
    'Offline',
    4.5,
    90
);

INSERT INTO Vehicle (
    Driver_ID,
    Make,
    Model,
    Vehicle_Year,
    Color,
    License_Plate,
    Vehicle_Type,
    Verification_Status
)
VALUES
(
    1,
    'Toyota',
    'Corolla',
    2021,
    'White',
    'ABC-123',
    'Economy',
    'Verified'
),
(
    2,
    'Honda',
    'Civic',
    2022,
    'Black',
    'XYZ-456',
    'Premium',
    'Verified'
);

INSERT INTO Location
(City, Street, HouseNo)
VALUES
('Islamabad', 'F-10 Markaz', '12A'),
('Islamabad', 'Blue Area', '45B'),
('Rawalpindi', 'Saddar', '22'),
('Rawalpindi', 'Commercial Market', '91');

INSERT INTO Ride (
    Rider_ID,
    Driver_ID,
    Vehicle_ID,
    Pickup_ID,
    Dropoff_ID,
    Fare,
    Distance_KM,
    Duration_Minutes,
    Ride_Status
)
VALUES
(
    1,
    1,
    1,
    1,
    2,
    650,
    12.5,
    25,
    'Completed'
),
(
    2,
    2,
    2,
    3,
    4,
    400,
    8.0,
    15,
    'InProgress'
);

INSERT INTO Payment (
    Ride_ID,
    Rider_ID,
    Amount,
    Payment_Method,
    Payment_Status
)
VALUES
(
    1,
    1,
    650,
    'Card',
    'Paid'
),
(
    2,
    2,
    400,
    'Cash',
    'Pending'
);

INSERT INTO PromoCode (
    Code,
    Discount,
    Expiry_Date,
    Usage_Count
)
VALUES
(
    'SAVE20',
    20,
    '2026-12-31',
    0
),
(
    'NEW50',
    50,
    '2026-10-01',
    0
);

INSERT INTO Payment_Promo
(Payment_ID, Promo_ID)
VALUES
(1, 1);

INSERT INTO Rating (
    Ride_ID,
    Rated_By,
    Rated_User_ID,
    Score,
    Comment
)
VALUES
(
    1,
    'Rider',
    1,
    5,
    'Excellent driver'
),
(
    1,
    'Driver',
    1,
    4,
    'Good passenger'
);

INSERT INTO Complaint (
    Ride_ID,
    Comment,
    Complaint_Status
)
VALUES
(
    1,
    'Driver arrived late',
    'Open'
);