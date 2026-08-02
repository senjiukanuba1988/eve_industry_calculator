
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
INSERT INTO `item_categories` (`id`, `name`) VALUES (17,'Component'),(16,'Drone'),(14,'Fuel Block'),(18,'Ice Product'),(10,'Mineral'),(11,'Planetary Industry Product'),(12,'Reaction Material'),(13,'Reaction Product'),(9,'Ship');
/*!40000 ALTER TABLE `item_categories` ENABLE KEYS */;

/*!40000 ALTER TABLE `items` DISABLE KEYS */;
INSERT INTO `items` (`id`, `name`, `category_id`) VALUES (13,'Cormorant',9),(14,'Tritanium',10),(15,'Pyerite',10),(16,'Mexallon',10),(17,'Isogen',10),(18,'Robotics',11),(19,'Consumer Electronics',11),(20,'Mechanical Parts',11),(21,'Tungsten Carbide',13),(22,'Rolled Tungsten Alloy',12),(23,'Sulfuric Acid',12),(30,'Nitrogen Fuel Block',14),(31,'Atmospheric Gases',12),(32,'Evaporite Deposits',12),(33,'Acolyte II',16),(34,'Acolyte I',16),(35,'R.A.M. - Robotics',17),(36,'Morphite',10),(37,'Laser Focusing Crystals',17),(38,'Guidance Systems',11),(39,'Nocxium',10),(40,'Fullerides',13),(41,'Hypersynaptic Fibers',13),(42,'Tungsten',12),(43,'Platinum',12),(44,'Carbon Polymers',12),(45,'Platinum Technite',12),(46,'Helium Fuel Block',14),(47,'Hydrocarbons',12),(48,'Silicates',12),(49,'Technetium',12),(50,'Solerium',12),(51,'Dysporite',12),(52,'Vanadium Hafnite',12),(54,'Chromium',12),(55,'Caesium',12),(56,'Oxygen Fuel Block',14),(57,'Mercury',12),(58,'Dysprosium',12),(59,'Hydrogen Fuel Block',14),(60,'Hafnium',12),(61,'Vanadium',12),(62,'Enriched Uranium',11),(63,'Oxygen',11),(64,'Coolant',11),(65,'Heavy Water',18),(66,'Liquid Ozone',18),(67,'Strontium Clathrates',18),(68,'Hydrogen Isotopes',18),(69,'Toxic Metals',11),(70,'Precious Metals',11),(71,'Reactive Metals',11),(72,'Electrolytes',11),(73,'Water',11),(74,'Chiral Structures',11),(75,'Nitrogen Isotopes',18),(76,'Oxygen Isotopes',18),(77,'Water-Cooled CPU',11),(78,'Transmitter',11),(79,'Plasmoids',11);
/*!40000 ALTER TABLE `items` ENABLE KEYS */;

/*!40000 ALTER TABLE `recipes` DISABLE KEYS */;
INSERT INTO `recipes` (`id`, `product_item_id`, `recipe_type`, `variant_label`, `output_quantity`, `notes`) VALUES (8,13,'t1_industry',NULL,1,NULL),(9,18,'pi',NULL,3,NULL),(10,21,'reaction',NULL,10000,NULL),(17,23,'reaction',NULL,200,NULL),(18,33,'t2_industry',NULL,10,NULL),(19,34,'t1_industry',NULL,10,NULL),(20,35,'t1_industry',NULL,100,NULL),(21,37,'t1_industry',NULL,1,NULL),(22,22,'reaction',NULL,200,NULL),(23,40,'reaction',NULL,3000,NULL),(24,44,'reaction',NULL,200,NULL),(25,45,'reaction',NULL,200,NULL),(26,41,'reaction',NULL,750,NULL),(27,50,'reaction',NULL,200,NULL),(28,51,'reaction',NULL,200,NULL),(29,52,'reaction',NULL,200,NULL),(30,59,'t1_industry',NULL,40,NULL),(31,62,'pi',NULL,5,NULL),(32,20,'pi',NULL,5,NULL),(33,64,'pi',NULL,5,NULL),(34,19,'pi',NULL,5,NULL),(35,30,'t1_industry',NULL,40,NULL),(36,56,'t1_industry',NULL,40,NULL),(37,38,'pi',NULL,3,NULL),(38,77,'pi',NULL,5,NULL),(39,78,'pi',NULL,5,NULL);
/*!40000 ALTER TABLE `recipes` ENABLE KEYS */;

/*!40000 ALTER TABLE `recipe_inputs` DISABLE KEYS */;
INSERT INTO `recipe_inputs` (`id`, `recipe_id`, `input_item_id`, `input_quantity`) VALUES (9,8,14,71280),(10,8,15,13365),(11,8,16,4455),(12,8,17,891),(13,9,19,10),(14,9,20,10),(24,10,22,98),(25,10,23,98),(26,10,30,5),(30,17,31,98),(31,17,32,98),(32,17,30,5),(33,18,34,10),(34,18,35,10),(35,18,36,10),(36,18,37,10),(37,18,38,10),(38,18,18,10),(39,19,14,4197),(40,19,16,36),(41,19,39,18),(42,20,14,475),(43,20,15,379),(44,20,16,190),(45,20,17,70),(46,20,39,31),(47,21,21,27),(48,21,40,10),(49,21,41,1),(50,22,42,98),(51,22,43,98),(52,22,30,5),(53,23,44,98),(54,23,45,98),(55,23,30,5),(56,24,47,98),(57,24,48,98),(58,24,46,5),(59,25,43,98),(60,25,49,98),(61,25,30,5),(62,26,50,98),(63,26,51,98),(64,26,52,98),(65,26,56,5),(66,27,54,98),(67,27,55,98),(68,27,56,5),(69,28,57,98),(70,28,58,98),(71,28,46,5),(72,29,61,98),(73,29,60,98),(74,29,59,5),(75,30,62,4),(76,30,63,20),(77,30,20,4),(78,30,64,9),(79,30,18,1),(80,30,65,152),(81,30,66,312),(82,30,67,18),(83,30,68,401),(84,31,69,40),(85,31,70,40),(86,32,71,40),(87,32,70,40),(88,33,72,40),(89,33,73,40),(90,34,69,40),(91,34,74,40),(92,35,62,4),(93,35,63,20),(94,35,20,4),(95,35,64,9),(96,35,18,1),(97,35,65,152),(98,35,66,312),(99,35,67,10),(100,35,75,401),(101,36,62,4),(102,36,63,20),(103,36,20,4),(104,36,64,9),(105,36,18,1),(106,36,65,152),(107,36,66,312),(108,36,67,18),(109,36,76,401),(110,37,77,10),(111,37,78,10),(112,38,71,40),(113,38,73,40),(114,39,74,40),(115,39,79,40);
/*!40000 ALTER TABLE `recipe_inputs` ENABLE KEYS */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

