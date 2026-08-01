
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

/*!40000 ALTER TABLE `item_categories` DISABLE KEYS */;
INSERT INTO `item_categories` (`id`, `name`) VALUES (10,'Mineral'),(11,'Planetary Industry Product'),(12,'Reaction Material'),(13,'Reaction Product'),(9,'Ship');
/*!40000 ALTER TABLE `item_categories` ENABLE KEYS */;

/*!40000 ALTER TABLE `items` DISABLE KEYS */;
INSERT INTO `items` (`id`, `name`, `category_id`) VALUES (13,'Cormorant',9),(14,'Tritanium',10),(15,'Pyerite',10),(16,'Mexallon',10),(17,'Isogen',10),(18,'Robotics',11),(19,'Consumer Electronics',11),(20,'Mechanical Parts',11),(21,'Tungsten Carbide',13),(22,'Rolled Tungsten Alloy',12),(23,'Sulfuric Acid',12);
/*!40000 ALTER TABLE `items` ENABLE KEYS */;

/*!40000 ALTER TABLE `recipes` DISABLE KEYS */;
INSERT INTO `recipes` (`id`, `product_item_id`, `recipe_type`, `variant_label`, `output_quantity`, `notes`) VALUES (8,13,'t1_industry',NULL,1,NULL),(9,18,'pi',NULL,3,NULL),(10,21,'reaction',NULL,10000,NULL);
/*!40000 ALTER TABLE `recipes` ENABLE KEYS */;

/*!40000 ALTER TABLE `recipe_inputs` DISABLE KEYS */;
INSERT INTO `recipe_inputs` (`id`, `recipe_id`, `input_item_id`, `input_quantity`) VALUES (9,8,14,71280),(10,8,15,13365),(11,8,16,4455),(12,8,17,891),(13,9,19,10),(14,9,20,10),(15,10,22,98),(16,10,23,98);
/*!40000 ALTER TABLE `recipe_inputs` ENABLE KEYS */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

