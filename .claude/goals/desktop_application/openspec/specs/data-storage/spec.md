# Data Storage Specification

## Purpose

Where the user's work lives and what guarantees it carries. The user's stated position is that data which exists only inside something they cannot open is data they do not really have. This capability makes that a requirement: readable files, in a place they can see, that survive replacing the application.

Nothing here prescribes a file format or a technology — only what the user must be able to do with their data.

## Requirements

### Requirement: Data is stored in human-readable files

All of the user's data — items, categories, recipes, hangar stock and plans — SHALL be stored in plain-text files whose contents can be read and understood by opening them in a text editor or a spreadsheet. Binary formats, compressed archives, and encodings that render the content as opaque characters SHALL NOT be used.

#### Scenario: Opening the data in a text editor

- **WHEN** the user opens the file holding their recipes in any text editor
- **THEN** they can read item names, quantities and recipe types as words and numbers
- **AND** they can tell which recipe is which without running the application

#### Scenario: Inspecting stock outside the application

- **WHEN** the user opens the file holding hangar stock
- **THEN** each line is recognisable as an item and a quantity

### Requirement: One visible data folder

All of the user's data SHALL live in one folder. The application SHALL show the full path to that folder and SHALL offer an action to open it in the system file browser. Copying that folder SHALL be a complete backup.

#### Scenario: Finding the data

- **WHEN** the user looks for where their data is kept
- **THEN** the application shows the full path, and can open the folder for them

#### Scenario: Backing up by copying

- **WHEN** the user copies the data folder somewhere else and later copies it back over the original
- **THEN** the application works with the restored data exactly as it did when the copy was taken

#### Scenario: Moving to another machine

- **WHEN** the user installs the application on a second machine and puts a copy of the data folder in place
- **THEN** the same recipes, hangar stock and plans are there, in the same state

### Requirement: Replacing the application never risks the data

Installing a newer version of the application SHALL leave the data folder untouched, and the new version SHALL pick it up on first start without the user doing anything.

#### Scenario: A routine update

- **WHEN** the user installs a newer version over an existing one
- **THEN** on first start all recipes, stock and plans are exactly as they were
- **AND** the user was not asked to export, import, or re-point anything

#### Scenario: Uninstalling

- **WHEN** the user removes the application
- **THEN** the data folder is left in place, and the user is told where it is

### Requirement: Changes to the data layout are migrated automatically

Where a newer version of the application needs the data arranged differently, it SHALL convert the existing data on first start, without the user intervening, and SHALL keep a copy of the files as they were before the conversion. That copy SHALL be kept inside the data folder, so that copying the folder also copies it, and SHALL stay until the user deletes it.

#### Scenario: Upgrading into a new layout

- **WHEN** a newer version that needs a different layout starts against data in an older layout
- **THEN** it converts the data and carries on
- **AND** it tells the user that a conversion happened and where the pre-conversion copy is, offering to open that folder

#### Scenario: A conversion that cannot be completed

- **WHEN** a conversion fails part way
- **THEN** the application leaves the original data as it found it, explains what went wrong, and does not start against half-converted data

#### Scenario: Going back after a conversion

- **GIVEN** a newer version has converted the data into a layout an older version does not understand
- **WHEN** the user wants to return to the older version
- **THEN** they do so by putting the pre-conversion copy back in place of the data files, after which the older version starts against it normally

#### Scenario: Opening data in a newer layout with an older version

- **WHEN** an older version of the application is started against data in a layout newer than it understands
- **THEN** it does not start working against that data, and modifies nothing
- **AND** it shows an error explaining that the data was written by a newer version, naming both versions

#### Scenario: Going back to an older version that uses the same layout

- **GIVEN** a newer version has written the data without changing its layout
- **WHEN** the user reinstalls an older version that uses the same layout
- **THEN** the older version starts normally against that data, with no conversion and no message

### Requirement: The data records which version wrote it

The data SHALL record, readable in the files like everything else, which layout it is arranged in and which version of the application last wrote it. On start, the application SHALL compare the layout with the newest one it understands, to decide whether a conversion is needed (the data is in an older layout) or whether it must refuse (the data is in a newer layout). The version that last wrote the data SHALL be used to name it in messages.

Every change to what the files can contain — however small, even one new optional piece of information — SHALL count as a new layout, so that an older version never reads data it could misunderstand or silently drop part of.

#### Scenario: Data in the same layout

- **WHEN** the application starts against data in the layout it uses itself
- **THEN** it starts normally, with no conversion and no message

### Requirement: Only one copy runs at a time

The application SHALL NOT run more than once at the same time against the same data.

#### Scenario: Starting a second copy

- **WHEN** the user starts the application while it is already running
- **THEN** no second copy starts
- **AND** the window already open is brought to the front

### Requirement: Work is saved as it happens

Each action that changes data SHALL be written to disk as it completes, so that losing the application unexpectedly costs at most the action in progress. An interrupted write SHALL NOT leave data unreadable or partially applied.

#### Scenario: Losing the application mid-session

- **WHEN** the application is force-quit immediately after a step is marked done
- **THEN** on restart that step is either done or not done, consistently with the hangar quantities
- **AND** no file is left unreadable

### Requirement: Hand-edited files are handled gracefully

Because the files are readable, the user may edit them, but only while the application is closed. Edits made while it is running are not supported and may be overwritten; the application SHALL say so wherever it shows the data folder.

Where the application finds data it cannot make sense of, it SHALL NOT start working against it and SHALL NOT discard or overwrite the file. It SHALL show an error saying that the data is malformed, naming the file and pointing as precisely as it can at the broken part — such as the line, or the section of the file — and what it expected there, offering to open the data folder and to try again.

#### Scenario: A malformed edit

- **WHEN** the user hand-edits a data file and introduces an error
- **THEN** the application shows only the error, naming the file and, where it can tell, the line or section it could not read
- **AND** it leaves the file as the user left it, so the mistake can be corrected
- **AND** once the user has fixed the file, trying again starts the application normally

#### Scenario: A valid edit

- **WHEN** the user hand-corrects a quantity in a data file while the application is closed
- **THEN** the application uses the corrected value on next start
