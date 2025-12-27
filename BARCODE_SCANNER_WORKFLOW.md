# Barcode Scanner System - Complete Workflow Guide

## Overview
The barcode scanner system allows drivers to scan barcodes on pickup bags, validate them, and track their lifecycle through the pickup process.

## System Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌──────────────┐
│  React Native   │  HTTP   │   Flask Backend   │  SQL    │   MySQL DB   │
│     App         │◄────────►│      API          │◄───────►│              │
│                 │         │                  │         │              │
└─────────────────┘         └──────────────────┘         └──────────────┘
```

## Database Tables

### 1. `barcode_master_table`
Stores all registered barcodes:
- `id` - Primary key
- `barcode_id` - Unique barcode identifier (e.g., "BC123456789")
- `bagtype` - Type of bag (e.g., "plastic", "paper", "mixed")
- `is_active` - Whether barcode is active (1) or inactive (0)
- `created_at` - Timestamp when barcode was registered

### 2. `pickup_bag_cycle`
Tracks the lifecycle of each bag through the pickup process:
- `id` - Primary key
- `cycle_id` - Unique cycle identifier (e.g., "CYCLE_20241215_BC123456")
- `barcode_id` - References barcode from master table
- `branch_code` - Branch where pickup occurred
- `pickup_weight` - Weight at pickup time
- `inbound_weight` - Weight at inbound time
- `status` - Current status: 'picked' → 'inbound' → 'sorting' → 'completed'
- `picked_at` - Timestamp when status changed to 'picked'
- `inbound_at` - Timestamp when status changed to 'inbound'
- `sorted_at` - Timestamp when status changed to 'sorting'
- `completed_at` - Timestamp when status changed to 'completed'
- `created_at` - Timestamp when cycle was created

## Complete Workflow

### Scenario 1: Driver Scans Barcode During Pickup

```
Step 1: Driver opens barcode scanner in vehicle app
   │
   ├─► Camera activates
   │
Step 2: Driver scans barcode (e.g., "BC123456789")
   │
   ├─► Frontend: handleBarcodeScanned("BC123456789")
   │   │
   │   └─► Calls: scanBarcode("BC123456789")
   │
Step 3: Frontend sends API request
   │
   ├─► POST /barcode/scan
   │   Headers: { Authorization: "Bearer <token>" }
   │   Body: { "barcode_id": "BC123456789" }
   │
Step 4: Backend validates barcode
   │
   ├─► Query: SELECT * FROM barcode_master_table 
   │          WHERE barcode_id = 'BC123456789' AND is_active = 1
   │
   ├─► If found: Returns barcode info
   │   │   {
   │   │     "status": "success",
   │   │     "data": {
   │   │       "id": 1,
   │   │       "barcode_id": "BC123456789",
   │   │       "bagtype": "plastic",
   │   │       "is_active": 1
   │   │     }
   │   │   }
   │   │
   └─► If not found: Returns error
       {
         "status": "error",
         "message": "Barcode not found or inactive"
       }

Step 5: Frontend displays result
   │
   ├─► If valid: Shows alert "Barcode Validated - Bag Type: plastic"
   │
   └─► If invalid: Shows alert "Barcode Error - Barcode not found"
```

### Scenario 2: Start Pickup Cycle (Scan + Start)

```
Step 1: Driver scans barcode and wants to start pickup cycle
   │
   ├─► Frontend: scanAndStartCycle(barcode_id, branch_code, pickup_weight)
   │
Step 2: Frontend sends API request
   │
   ├─► POST /barcode/cycle/scan-and-start
   │   Body: {
   │     "barcode_id": "BC123456789",
   │     "branch_code": "BR001",
   │     "pickup_weight": 25.5
   │   }
   │
Step 3: Backend processes request
   │
   ├─► Validates barcode exists and is active
   │   ├─► If invalid: Returns 404 error
   │   │
   ├─► Checks for existing active cycle
   │   ├─► If exists: Returns 409 error (conflict)
   │   │
   └─► Creates new cycle
       INSERT INTO pickup_bag_cycle (
         cycle_id,           -- Auto-generated: "CYCLE_20241215_BC123456"
         barcode_id,         -- "BC123456789"
         branch_code,        -- "BR001"
         pickup_weight,      -- 25.5
         status,             -- 'picked'
         picked_at,          -- NOW()
         created_at          -- NOW()
       )

Step 4: Backend returns cycle details
   │
   └─► {
         "status": "success",
         "message": "Barcode scanned and pickup cycle started",
         "data": {
           "barcode_info": {
             "barcode_id": "BC123456789",
             "bagtype": "plastic"
           },
           "cycle": {
             "id": 100,
             "cycle_id": "CYCLE_20241215_BC123456",
             "barcode_id": "BC123456789",
             "branch_code": "BR001",
             "pickup_weight": 25.5,
             "status": "picked",
             "picked_at": "2024-12-15 10:30:00"
           }
         }
       }
```

### Scenario 3: Update Cycle Status (Lifecycle Progression)

```
Initial State: status = 'picked'
   │
   ├─► Driver completes pickup at branch
   │
Step 1: Update to 'inbound' (when bag arrives at facility)
   │
   ├─► Frontend: updateCycleStatus(cycle_id, 'inbound', inbound_weight)
   │
   ├─► POST /barcode/cycle/100/update-status
   │   Body: {
   │     "status": "inbound",
   │     "inbound_weight": 24.8  // Optional weight difference
   │   }
   │
   ├─► Backend validates transition
   │   ├─► Current: 'picked' → Requested: 'inbound' ✅ Valid
   │   │
   └─► Updates database
       UPDATE pickup_bag_cycle
       SET status = 'inbound',
           inbound_at = NOW(),
           inbound_weight = 24.8
       WHERE id = 100

Step 2: Update to 'sorting' (when bag is being sorted)
   │
   ├─► POST /barcode/cycle/100/update-status
   │   Body: { "status": "sorting" }
   │
   └─► Backend updates
       UPDATE pickup_bag_cycle
       SET status = 'sorting',
           sorted_at = NOW()
       WHERE id = 100

Step 3: Update to 'completed' (when processing is done)
   │
   ├─► POST /barcode/cycle/100/update-status
   │   Body: { "status": "completed" }
   │
   └─► Backend updates
       UPDATE pickup_bag_cycle
       SET status = 'completed',
           completed_at = NOW()
       WHERE id = 100
```

## Status Transition Rules

The system enforces valid status transitions:

```
picked → inbound → sorting → completed
  │        │         │          │
  └────────┴─────────┴──────────┘
   (Must follow this order)
```

**Invalid transitions are rejected:**
- ❌ `picked` → `completed` (skips steps)
- ❌ `inbound` → `picked` (going backwards)
- ❌ `completed` → `sorting` (already completed)

## API Endpoints Reference

### Barcode Operations

1. **Scan Barcode**
   ```
   POST /barcode/scan
   Body: { "barcode_id": "BC123456789" }
   Returns: Barcode info if valid
   ```

2. **Register Barcode**
   ```
   POST /barcode/register
   Body: {
     "barcode_id": "BC123456789",
     "bagtype": "plastic",
     "is_active": 1
   }
   Returns: Registered barcode details
   ```

3. **List Barcodes**
   ```
   GET /barcode/master/list?is_active=1&bagtype=plastic&limit=100&offset=0
   Returns: Paginated list of barcodes
   ```

### Cycle Operations

4. **Start Pickup Cycle**
   ```
   POST /barcode/cycle/start
   Body: {
     "barcode_id": "BC123456789",
     "branch_code": "BR001",
     "pickup_weight": 25.5,
     "cycle_id": "CYCLE_20241215_BC123456"  // Optional
   }
   Returns: Created cycle details
   ```

5. **Scan and Start (Combined)**
   ```
   POST /barcode/cycle/scan-and-start
   Body: {
     "barcode_id": "BC123456789",
     "branch_code": "BR001",
     "pickup_weight": 25.5
   }
   Returns: Barcode info + cycle details
   ```

6. **Update Cycle Status**
   ```
   POST /barcode/cycle/{cycle_id}/update-status
   Body: {
     "status": "inbound",
     "inbound_weight": 24.8  // Optional, only for 'inbound'
   }
   Returns: Updated cycle details
   ```

7. **Get Cycle Details**
   ```
   GET /barcode/cycle/{cycle_id}
   Returns: Full cycle information with barcode details
   ```

8. **List Cycles**
   ```
   GET /barcode/cycle/list?status=picked&branch_code=BR001&limit=100&offset=0
   Returns: Paginated list of cycles
   ```

9. **Get Cycles by Barcode**
   ```
   GET /barcode/cycle/by-barcode/BC123456789
   Returns: All cycles for a specific barcode
   ```

## Frontend Integration

### Current Implementation (UpdatingStatsScreen)

When driver scans a barcode:
1. Camera captures barcode
2. `handleBarcodeScanned()` is called
3. Frontend calls `scanBarcode()` API function
4. Backend validates barcode
5. Alert shows result:
   - ✅ Valid: "Barcode Validated - Bag Type: plastic"
   - ❌ Invalid: "Barcode Error - Barcode not found or inactive"

### Available API Functions (in frontendStore.js)

```javascript
// Validate barcode
const result = await scanBarcode("BC123456789");

// Scan and start cycle in one call
const result = await scanAndStartCycle(
  "BC123456789",  // barcode_id
  "BR001",        // branch_code
  25.5            // pickup_weight
);

// Start cycle separately
const result = await startPickupCycle(
  "BC123456789",  // barcode_id
  "BR001",        // branch_code
  25.5,           // pickup_weight
  "CYCLE_20241215_BC123456"  // Optional cycle_id
);

// Update cycle status
const result = await updateCycleStatus(
  100,            // cycle_id (database ID)
  "inbound",      // status
  24.8            // Optional inbound_weight
);

// Get cycle details
const result = await getCycleDetails(100);

// Get all cycles for a barcode
const result = await getCyclesByBarcode("BC123456789");
```

## Example Use Cases

### Use Case 1: Driver Picks Up Bag
1. Driver arrives at branch
2. Driver scans barcode on bag
3. App validates barcode ✅
4. Driver enters weight: 25.5 kg
5. App calls `scanAndStartCycle("BC123456789", "BR001", 25.5)`
6. Cycle created with status 'picked'
7. Bag is loaded into vehicle

### Use Case 2: Bag Arrives at Facility
1. Bag arrives at sorting facility
2. Staff scans barcode
3. App calls `updateCycleStatus(100, "inbound", 24.8)`
4. Status updated to 'inbound'
5. Weight verified: 24.8 kg (slight difference from pickup)

### Use Case 3: Bag Being Sorted
1. Bag moves to sorting area
2. Staff updates status: `updateCycleStatus(100, "sorting")`
3. Status updated to 'sorting'
4. Bag is processed

### Use Case 4: Bag Processing Complete
1. Sorting and processing complete
2. Staff updates status: `updateCycleStatus(100, "completed")`
3. Status updated to 'completed'
4. Cycle is finished, timestamps recorded

## Error Handling

### Common Errors

1. **Barcode Not Found**
   ```
   Status: 404
   Message: "Barcode not found or inactive"
   ```

2. **Active Cycle Exists**
   ```
   Status: 409
   Message: "Active cycle already exists for this barcode"
   ```

3. **Invalid Status Transition**
   ```
   Status: 400
   Message: "Invalid status transition. Current: picked, Requested: completed"
   ```

4. **Network Error**
   ```
   Frontend catches error and shows: "Failed to validate barcode. Please try again."
   ```

## Security & Authentication

- All endpoints require authentication token
- Token passed in `Authorization: Bearer <token>` header
- Token validated by backend before processing
- Invalid/expired tokens return 401 Unauthorized

## Data Flow Diagram

```
┌──────────────┐
│   Driver     │
│  Scans Code  │
└──────┬───────┘
       │
       ▼
┌─────────────────┐
│ React Native App│
│  Camera Scanner │
└──────┬──────────┘
       │
       │ POST /barcode/scan
       ▼
┌─────────────────┐
│  Flask Backend  │
│  Validates Code │
└──────┬──────────┘
       │
       │ SELECT query
       ▼
┌─────────────────┐
│   MySQL DB      │
│ barcode_master  │
└──────┬──────────┘
       │
       │ Returns barcode info
       ▼
┌─────────────────┐
│  Flask Backend  │
│  Returns Result │
└──────┬──────────┘
       │
       │ JSON response
       ▼
┌─────────────────┐
│ React Native App│
│  Shows Alert    │
└─────────────────┘
```

## Next Steps for Full Integration

To complete the integration, you can:

1. **Add "Start Cycle" button** after barcode validation
2. **Get branch_code** from current pickup session
3. **Use weight input** field for pickup_weight
4. **Show cycle status** in the UI
5. **Add cycle history** view for each barcode
6. **Implement status updates** at different stages

The system is ready to use! The barcode scanner now validates with the backend, and all cycle management APIs are available.

