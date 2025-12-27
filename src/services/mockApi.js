/**
 * API Service (Mocked)
 * Frontend-only: returns local, deterministic mock data and never calls network.
 */

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildMockPickup = (index) => ({
  customer_name: `Customer ${index}`,
  address: `H no ${index}, Mayavati nagar, Gurugram`,
  latitude: 28.4595 + (index - 1) * 0.001,
  longitude: 77.0266 + (index - 1) * 0.001,
  next_pickup_date: null,
});

class ApiService {
  static async authenticateDriver(vehicleNumber, drivingLicense) {
    await delay(300);
    const total = 10;
    const pickups = Array.from({ length: total }, (_, i) => buildMockPickup(i + 1));
    return {
      driver_id: 'DRV-' + drivingLicense,
      vehicle_number: vehicleNumber,
      driver_name: 'Mock Driver',
      total_pickups: total,
      pickups,
    };
  }

  static async getPickupDetails(driverId, pickupIndex) {
    await delay(150);
    const idx = Number(pickupIndex) + 1;
    return buildMockPickup(idx);
  }

  static async updatePickupStatus(driverId, pickupIndex, updateData) {
    await delay(120);
    return { ok: true, status: 'updated', pickupIndex, updateData };
  }

  static async getDriverPickups(driverId) {
    await delay(150);
    return Array.from({ length: 10 }, (_, i) => buildMockPickup(i + 1));
  }

  static async authenticateDriverV2(vehicleNumber, drivingLicense) {
    await delay(300);
    const totalStops = 10;
    const currentSequence = 1; // 1-based
    const currentStop = {
      customer_name: 'Customer 1',
      address: 'H no 1, Mayavati nagar, Gurugram',
      latitude: 28.4595,
      longitude: 77.0266,
      customer_id_snapshot: 'CUST-1',
    };
    return {
      assignment_id: Math.floor(Math.random() * 100000),
      driver_dl: drivingLicense,
      vehicle_no: vehicleNumber,
      total_stops: totalStops,
      driver_name: 'Mock Driver',
      route_date: new Date().toISOString().slice(0, 10),
      current_stop: currentStop,
    };
  }

  static async getAssignmentStop(assignmentId, sequence) {
    await delay(120);
    const idx = Number(sequence);
    return { stop: { ...buildMockPickup(idx), customer_id_snapshot: `CUST-${idx}` } };
  }

  static async completeAssignmentStop(assignmentId, sequence, completionData = {}) {
    await delay(120);
    return { ok: true, completed: true, sequence, completionData };
  }

  static async getAssignmentProgress(assignmentId) {
    await delay(100);
    return { current: 1, total: 10 };
  }

  static async startTrip(assignmentId) {
    await delay(80);
    return { ok: true, started_at: new Date().toISOString() };
  }

  static async endTrip(assignmentId) {
    await delay(80);
    return { ok: true, ended_at: new Date().toISOString() };
  }

  static async startPickup(assignmentId, sequence) {
    await delay(80);
    return { ok: true, pickup_started_at: new Date().toISOString() };
  }
}

export default ApiService;



