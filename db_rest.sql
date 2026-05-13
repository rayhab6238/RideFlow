CREATE VIEW ActiveRidesView AS

SELECT
    R.Ride_ID,
    RU.FullName AS Rider_Name,
    DU.FullName AS Driver_Name,
    V.Model AS Vehicle_Model,
    R.Pickup_ID,
    R.Dropoff_ID,
    R.Fare,
    R.Ride_Status,
    R.Request_Time

FROM Ride R

JOIN Rider RR
ON R.Rider_ID = RR.Rider_ID

JOIN Users RU
ON RR.User_ID = RU.User_ID

JOIN Driver D
ON R.Driver_ID = D.Driver_ID

JOIN Users DU
ON D.User_ID = DU.User_ID

JOIN Vehicle V
ON R.Vehicle_ID = V.Vehicle_ID

WHERE R.Ride_Status IN
('Accepted', 'EnRoute', 'InProgress');

CREATE VIEW TopDriversView AS

SELECT
    D.Driver_ID,
    U.FullName,
    D.Avg_Rating,
    D.Total_Trips

FROM Driver D

JOIN Users U
ON D.User_ID = U.User_ID

WHERE D.Avg_Rating > 4.5;

-- =========================================
-- INDEXES
-- =========================================

CREATE INDEX idx_rider_id
ON Ride(Rider_ID);

CREATE INDEX idx_driver_id
ON Ride(Driver_ID);

CREATE INDEX idx_ride_status
ON Ride(Ride_Status);

CREATE INDEX idx_city
ON Location(City);

-- =========================================
-- STORED PROCEDURE
-- =========================================

DELIMITER $$

CREATE PROCEDURE CalculateFare(

    IN p_distance DECIMAL(6,2),

    IN p_duration INT,

    IN p_surge DECIMAL(4,2),

    OUT p_total DECIMAL(10,2)

)

BEGIN

    DECLARE base_rate DECIMAL(10,2);
    DECLARE per_km_rate DECIMAL(10,2);
    DECLARE per_min_rate DECIMAL(10,2);

    -- Fetch dynamic fare rules from the database
    SELECT Base_Rate, Per_KM_Rate, Per_Min_Rate 
    INTO base_rate, per_km_rate, per_min_rate 
    FROM FareRules 
    LIMIT 1;

    -- Fallback in case FareRules is somehow empty
    IF base_rate IS NULL THEN
        SET base_rate = 150;
        SET per_km_rate = 40;
        SET per_min_rate = 5;
    END IF;

    SET p_total =
    (
        base_rate +
        (per_km_rate * p_distance) +
        (per_min_rate * p_duration)
    ) * p_surge;

END $$

DELIMITER ;

-- =========================================
-- TRIGGERS
-- =========================================

DELIMITER $$

CREATE TRIGGER trg_payment_paid

AFTER UPDATE ON Payment

FOR EACH ROW

BEGIN

    IF NEW.Payment_Status = 'Paid'
    AND OLD.Payment_Status <> 'Paid' THEN

        UPDATE Ride

        SET Ride_Status = 'Completed'

        WHERE Ride_ID = NEW.Ride_ID
        AND Ride_Status NOT IN ('Cancelled', 'Completed');

    END IF;

END $$

DELIMITER ;

DELIMITER $$

CREATE TRIGGER trg_low_driver_rating

AFTER INSERT ON Rating

FOR EACH ROW

BEGIN

    DECLARE avg_rating DECIMAL(3,2);

    IF NEW.Rated_By = 'Rider' THEN

        SELECT AVG(Score)
        INTO avg_rating

        FROM Rating

        WHERE Rated_User_ID = NEW.Rated_User_ID
        AND Rated_By = 'Rider';

        UPDATE Driver
        SET Avg_Rating = avg_rating
        WHERE Driver_ID = NEW.Rated_User_ID;

        IF avg_rating < 3.5 THEN

            UPDATE Users U

            JOIN Driver D
            ON U.User_ID = D.User_ID

            SET U.Account_Status = 'Suspended'

            WHERE D.Driver_ID = NEW.Rated_User_ID;

            INSERT INTO Admin_Notifications (
                Driver_ID,
                Message
            )

            VALUES (
                NEW.Rated_User_ID,
                CONCAT(
                    'Driver ID ',
                    NEW.Rated_User_ID,
                    ' suspended due to low rating: ',
                    avg_rating
                )
            );

        END IF;

    END IF;

END $$

DELIMITER ;

DELIMITER $$

CREATE TRIGGER trg_promo_usage

AFTER INSERT ON Payment_Promo

FOR EACH ROW

BEGIN

    UPDATE PromoCode

    SET Usage_Count = Usage_Count + 1

    WHERE Promo_ID = NEW.Promo_ID;

END $$

DELIMITER ;

-- =========================================
-- EVENT
-- =========================================

DROP EVENT IF EXISTS expire_promos;

CREATE EVENT expire_promos

ON SCHEDULE EVERY 1 DAY

STARTS '2026-05-11 00:00:00'

DO

UPDATE PromoCode

SET Status = 'Expired'

WHERE Expiry_Date < CURDATE();

-- =========================================
-- REQUIRED QUERIES
-- =========================================

-- total revenue per city

SELECT
    L.City,
    SUM(P.Amount) AS Total_Revenue

FROM Payment P

JOIN Ride R
ON P.Ride_ID = R.Ride_ID

JOIN Location L
ON R.Pickup_ID = L.Location_ID

WHERE P.Payment_Status = 'Paid'

GROUP BY L.City;

-- drivers below 3.5 rating

SELECT
    Rated_User_ID AS Driver_ID,
    AVG(Score) AS Average_Rating

FROM Rating

WHERE Rated_By = 'Rider'

GROUP BY Rated_User_ID

HAVING AVG(Score) < 3.5;

-- trips completed per driver

SELECT
    D.Driver_ID,
    U.FullName,
    COUNT(*) AS Total_Completed_Trips

FROM Ride R

JOIN Driver D
ON R.Driver_ID = D.Driver_ID

JOIN Users U
ON D.User_ID = U.User_ID

WHERE R.Ride_Status = 'Completed'

GROUP BY D.Driver_ID, U.FullName;

-- full report

SELECT
    R.Ride_ID,
    RU.FullName AS Rider_Name,
    DU.FullName AS Driver_Name,
    V.Make,
    V.Model,
    V.Vehicle_Type,
    R.Fare,
    R.Distance_KM,
    R.Duration_Minutes,
    R.Ride_Status,
    R.Request_Time

FROM Ride R

INNER JOIN Rider RR
ON R.Rider_ID = RR.Rider_ID

INNER JOIN Users RU
ON RR.User_ID = RU.User_ID

INNER JOIN Driver D
ON R.Driver_ID = D.Driver_ID

INNER JOIN Users DU
ON D.User_ID = DU.User_ID

INNER JOIN Vehicle V
ON R.Vehicle_ID = V.Vehicle_ID;

-- riders including those with no rides

SELECT
    U.FullName AS Rider_Name,
    R.Ride_ID,
    R.Ride_Status

FROM Rider RD

LEFT JOIN Ride R
ON RD.Rider_ID = R.Rider_ID

LEFT JOIN Users U
ON RD.User_ID = U.User_ID;

-- payments and promo codes

SELECT
    P.Payment_ID,
    P.Amount,
    P.Payment_Method,
    PC.Code AS Promo_Code,
    PC.Discount

FROM Payment P

LEFT JOIN Payment_Promo PP
ON P.Payment_ID = PP.Payment_ID

LEFT JOIN PromoCode PC
ON PP.Promo_ID = PC.Promo_ID;

-- completed rides for rider

SELECT
    R.Ride_ID,
    U.FullName AS Rider_Name,
    R.Fare,
    R.Distance_KM,
    R.Duration_Minutes,
    R.Ride_Status,
    R.Request_Time,
    R.Start_Time,
    R.End_Time

FROM Ride R

JOIN Rider RD
ON R.Rider_ID = RD.Rider_ID

JOIN Users U
ON RD.User_ID = U.User_ID

WHERE R.Rider_ID = 1
AND R.Ride_Status = 'Completed'

ORDER BY R.Request_Time DESC;

-- drivers in city ordered by rating

SELECT
    D.Driver_ID,
    U.FullName AS Driver_Name,
    D.Avg_Rating,
    D.Total_Trips,
    L.City

FROM Driver D

JOIN Users U
ON D.User_ID = U.User_ID

JOIN Ride R
ON D.Driver_ID = R.Driver_ID

JOIN Location L
ON R.Pickup_ID = L.Location_ID

WHERE L.City = 'Islamabad'

GROUP BY
    D.Driver_ID,
    U.FullName,
    D.Avg_Rating,
    D.Total_Trips,
    L.City

ORDER BY D.Avg_Rating DESC;

-- =========================================
-- DCL
-- =========================================

CREATE ROLE IF NOT EXISTS rider_role;
CREATE ROLE IF NOT EXISTS driver_role;
CREATE ROLE IF NOT EXISTS admin_role;
CREATE ROLE IF NOT EXISTS support_role;

GRANT SELECT, INSERT
ON defaultdb.Ride
TO rider_role;

GRANT SELECT, INSERT
ON defaultdb.Payment
TO rider_role;

GRANT SELECT
ON defaultdb.Ride
TO driver_role;

GRANT ALL PRIVILEGES
ON defaultdb.*
TO admin_role;

GRANT SELECT, DELETE
ON defaultdb.Complaint
TO support_role;

REVOKE DELETE
ON defaultdb.Complaint
FROM support_role;