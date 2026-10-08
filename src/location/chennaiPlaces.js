/**
 * Chennai demonstration catalog for UrbanGrid.
 *
 * Hierarchy: CITY → ZONE → WARD → AREA → PLACE → CIVIC ISSUE.
 *  - Every ward has a unique Ward Number + Ward ID (WARD-001 …).
 *  - Every area belongs to exactly one ward.
 *  - Every place has a globally unique Place ID (PLACE-001 …) and belongs to one area/ward.
 *
 * DEMO DATA NOTICE: These are demonstration locations only. Ward numbers and
 * approximate coverage circles do NOT correspond to official Greater Chennai
 * Corporation ward boundaries unless verified against official municipal data.
 */

export const DEMO_NOTICE =
  'Demonstration dataset: ward numbers, names and coverage are illustrative and do not represent official Chennai Corporation boundaries.';

export const CITY = {
  city: 'Chennai',
  state: 'Tamil Nadu',
  country: 'India',
  center: { latitude: 13.0827, longitude: 80.2707 },
  zoom: 12,
  bounds: [
    [12.82, 80.05],
    [13.22, 80.36],
  ],
};

/** Approximate auto-detection radii (metres) used by the ward engine. */
export const GEO = {
  placeSnapRadius: 600,
  wardDetectionRadius: 3000,
};

export const ZONES = [
  { zone_id: 'ZONE-CENTRAL', zone_name: 'Central Zone' },
  { zone_id: 'ZONE-NORTH', zone_name: 'North Zone' },
  { zone_id: 'ZONE-WEST', zone_name: 'West Zone' },
  { zone_id: 'ZONE-SOUTH', zone_name: 'South Zone' },
];

export const WARDS = [
  { ward_id: 'WARD-001', ward_number: '001', ward_name: 'Anna Nagar Central', zone: 'Central Zone', area: 'Anna Nagar', latitude: 13.085, longitude: 80.2101, postal_code: '600040', active: true },
  { ward_id: 'WARD-002', ward_number: '002', ward_name: 'Anna Nagar West', zone: 'Central Zone', area: 'Anna Nagar West', latitude: 13.0878, longitude: 80.1998, postal_code: '600040', active: true },
  { ward_id: 'WARD-003', ward_number: '003', ward_name: 'T Nagar Central', zone: 'South Zone', area: 'T Nagar', latitude: 13.0418, longitude: 80.2337, postal_code: '600017', active: true },
  { ward_id: 'WARD-004', ward_number: '004', ward_name: 'Egmore', zone: 'Central Zone', area: 'Egmore', latitude: 13.0732, longitude: 80.2609, postal_code: '600008', active: true },
  { ward_id: 'WARD-005', ward_number: '005', ward_name: 'Park Town', zone: 'Central Zone', area: 'Park Town', latitude: 13.0825, longitude: 80.275, postal_code: '600003', active: true },
  { ward_id: 'WARD-006', ward_number: '006', ward_name: 'George Town', zone: 'Central Zone', area: 'George Town', latitude: 13.092, longitude: 80.287, postal_code: '600001', active: true },
  { ward_id: 'WARD-007', ward_number: '007', ward_name: 'Triplicane', zone: 'Central Zone', area: 'Triplicane', latitude: 13.058, longitude: 80.275, postal_code: '600005', active: true },
  { ward_id: 'WARD-008', ward_number: '008', ward_name: 'Royapettah', zone: 'Central Zone', area: 'Royapettah', latitude: 13.052, longitude: 80.262, postal_code: '600014', active: true },
  { ward_id: 'WARD-009', ward_number: '009', ward_name: 'Purasawalkam', zone: 'Central Zone', area: 'Purasawalkam', latitude: 13.085, longitude: 80.254, postal_code: '600007', active: true },
  { ward_id: 'WARD-010', ward_number: '010', ward_name: 'Nungambakkam', zone: 'Central Zone', area: 'Nungambakkam', latitude: 13.0564, longitude: 80.2307, postal_code: '600034', active: true },
  { ward_id: 'WARD-011', ward_number: '011', ward_name: 'Perambur', zone: 'North Zone', area: 'Perambur', latitude: 13.121, longitude: 80.232, postal_code: '600011', active: true },
  { ward_id: 'WARD-012', ward_number: '012', ward_name: 'Kolathur', zone: 'North Zone', area: 'Kolathur', latitude: 13.124, longitude: 80.212, postal_code: '600099', active: true },
  { ward_id: 'WARD-013', ward_number: '013', ward_name: 'Madhavaram', zone: 'North Zone', area: 'Madhavaram', latitude: 13.147, longitude: 80.231, postal_code: '600060', active: true },
  { ward_id: 'WARD-014', ward_number: '014', ward_name: 'Tondiarpet', zone: 'North Zone', area: 'Tondiarpet', latitude: 13.126, longitude: 80.289, postal_code: '600081', active: true },
  { ward_id: 'WARD-015', ward_number: '015', ward_name: 'Washermanpet', zone: 'North Zone', area: 'Washermanpet', latitude: 13.11, longitude: 80.287, postal_code: '600021', active: true },
  { ward_id: 'WARD-016', ward_number: '016', ward_name: 'Mogappair', zone: 'West Zone', area: 'Mogappair', latitude: 13.083, longitude: 80.184, postal_code: '600037', active: true },
  { ward_id: 'WARD-017', ward_number: '017', ward_name: 'Ambattur', zone: 'West Zone', area: 'Ambattur', latitude: 13.1143, longitude: 80.154, postal_code: '600053', active: true },
  { ward_id: 'WARD-018', ward_number: '018', ward_name: 'Avadi', zone: 'West Zone', area: 'Avadi', latitude: 13.1147, longitude: 80.1098, postal_code: '600054', active: true },
  { ward_id: 'WARD-019', ward_number: '019', ward_name: 'Porur', zone: 'West Zone', area: 'Porur', latitude: 13.037, longitude: 80.157, postal_code: '600116', active: true },
  { ward_id: 'WARD-020', ward_number: '020', ward_name: 'Koyambedu', zone: 'West Zone', area: 'Koyambedu', latitude: 13.0674, longitude: 80.1948, postal_code: '600107', active: true },
  { ward_id: 'WARD-021', ward_number: '021', ward_name: 'Saidapet', zone: 'South Zone', area: 'Saidapet', latitude: 13.021, longitude: 80.223, postal_code: '600015', active: true },
  { ward_id: 'WARD-022', ward_number: '022', ward_name: 'Guindy', zone: 'South Zone', area: 'Guindy', latitude: 13.0067, longitude: 80.2206, postal_code: '600032', active: true },
  { ward_id: 'WARD-023', ward_number: '023', ward_name: 'Adyar', zone: 'South Zone', area: 'Adyar', latitude: 13.005, longitude: 80.251, postal_code: '600020', active: true },
  { ward_id: 'WARD-024', ward_number: '024', ward_name: 'Velachery', zone: 'South Zone', area: 'Velachery', latitude: 12.981, longitude: 80.218, postal_code: '600042', active: true },
  { ward_id: 'WARD-025', ward_number: '025', ward_name: 'Tharamani', zone: 'South Zone', area: 'Tharamani', latitude: 12.986, longitude: 80.243, postal_code: '600113', active: true },
  { ward_id: 'WARD-026', ward_number: '026', ward_name: 'Meenambakkam', zone: 'South Zone', area: 'Meenambakkam', latitude: 12.9941, longitude: 80.1709, postal_code: '600027', active: true },
  { ward_id: 'WARD-027', ward_number: '027', ward_name: 'Sholinganallur', zone: 'South Zone', area: 'Sholinganallur', latitude: 12.914, longitude: 80.229, postal_code: '600119', active: true },
  { ward_id: 'WARD-028', ward_number: '028', ward_name: 'Tambaram', zone: 'South Zone', area: 'Tambaram', latitude: 12.9249, longitude: 80.1075, postal_code: '600045', active: true },
];

export const AREAS = [
  { area_id: 'AREA-001', area_name: 'Anna Nagar', ward_id: 'WARD-001', latitude: 13.085, longitude: 80.2101, postal_code: '600040' },
  { area_id: 'AREA-002', area_name: 'Anna Nagar West', ward_id: 'WARD-002', latitude: 13.0878, longitude: 80.1998, postal_code: '600040' },
  { area_id: 'AREA-003', area_name: 'T Nagar', ward_id: 'WARD-003', latitude: 13.0418, longitude: 80.2337, postal_code: '600017' },
  { area_id: 'AREA-004', area_name: 'Egmore', ward_id: 'WARD-004', latitude: 13.0732, longitude: 80.2609, postal_code: '600008' },
  { area_id: 'AREA-005', area_name: 'Park Town', ward_id: 'WARD-005', latitude: 13.0825, longitude: 80.275, postal_code: '600003' },
  { area_id: 'AREA-006', area_name: 'George Town', ward_id: 'WARD-006', latitude: 13.092, longitude: 80.287, postal_code: '600001' },
  { area_id: 'AREA-007', area_name: 'Triplicane', ward_id: 'WARD-007', latitude: 13.058, longitude: 80.275, postal_code: '600005' },
  { area_id: 'AREA-008', area_name: 'Royapettah', ward_id: 'WARD-008', latitude: 13.055, longitude: 80.264, postal_code: '600014' },
  { area_id: 'AREA-009', area_name: 'Mylapore', ward_id: 'WARD-008', latitude: 13.0336, longitude: 80.269, postal_code: '600004' },
  { area_id: 'AREA-010', area_name: 'Mount Road', ward_id: 'WARD-008', latitude: 13.044, longitude: 80.247, postal_code: '600002' },
  { area_id: 'AREA-011', area_name: 'Purasawalkam', ward_id: 'WARD-009', latitude: 13.085, longitude: 80.254, postal_code: '600007' },
  { area_id: 'AREA-012', area_name: 'Nungambakkam', ward_id: 'WARD-010', latitude: 13.0604, longitude: 80.2405, postal_code: '600034' },
  { area_id: 'AREA-013', area_name: 'Kodambakkam', ward_id: 'WARD-010', latitude: 13.0524, longitude: 80.2209, postal_code: '600024' },
  { area_id: 'AREA-014', area_name: 'Perambur', ward_id: 'WARD-011', latitude: 13.121, longitude: 80.232, postal_code: '600011' },
  { area_id: 'AREA-015', area_name: 'Kolathur', ward_id: 'WARD-012', latitude: 13.124, longitude: 80.212, postal_code: '600099' },
  { area_id: 'AREA-016', area_name: 'Madhavaram', ward_id: 'WARD-013', latitude: 13.147, longitude: 80.231, postal_code: '600060' },
  { area_id: 'AREA-017', area_name: 'Tondiarpet', ward_id: 'WARD-014', latitude: 13.126, longitude: 80.289, postal_code: '600081' },
  { area_id: 'AREA-018', area_name: 'Washermanpet', ward_id: 'WARD-015', latitude: 13.11, longitude: 80.287, postal_code: '600021' },
  { area_id: 'AREA-019', area_name: 'Mogappair', ward_id: 'WARD-016', latitude: 13.083, longitude: 80.184, postal_code: '600037' },
  { area_id: 'AREA-020', area_name: 'Ambattur', ward_id: 'WARD-017', latitude: 13.1143, longitude: 80.154, postal_code: '600053' },
  { area_id: 'AREA-021', area_name: 'Avadi', ward_id: 'WARD-018', latitude: 13.1147, longitude: 80.1098, postal_code: '600054' },
  { area_id: 'AREA-022', area_name: 'Porur', ward_id: 'WARD-019', latitude: 13.037, longitude: 80.157, postal_code: '600116' },
  { area_id: 'AREA-023', area_name: 'Koyambedu', ward_id: 'WARD-020', latitude: 13.0674, longitude: 80.1948, postal_code: '600107' },
  { area_id: 'AREA-024', area_name: 'Saidapet', ward_id: 'WARD-021', latitude: 13.021, longitude: 80.223, postal_code: '600015' },
  { area_id: 'AREA-025', area_name: 'Guindy', ward_id: 'WARD-022', latitude: 13.0067, longitude: 80.2206, postal_code: '600032' },
  { area_id: 'AREA-026', area_name: 'Adyar', ward_id: 'WARD-023', latitude: 13.005, longitude: 80.251, postal_code: '600020' },
  { area_id: 'AREA-027', area_name: 'Besant Nagar', ward_id: 'WARD-023', latitude: 13.0002, longitude: 80.2668, postal_code: '600090' },
  { area_id: 'AREA-028', area_name: 'Velachery', ward_id: 'WARD-024', latitude: 12.981, longitude: 80.218, postal_code: '600042' },
  { area_id: 'AREA-029', area_name: 'Tharamani', ward_id: 'WARD-025', latitude: 12.986, longitude: 80.243, postal_code: '600113' },
  { area_id: 'AREA-030', area_name: 'Meenambakkam', ward_id: 'WARD-026', latitude: 12.9941, longitude: 80.1709, postal_code: '600027' },
  { area_id: 'AREA-031', area_name: 'Sholinganallur', ward_id: 'WARD-027', latitude: 12.9, longitude: 80.227, postal_code: '600119' },
  { area_id: 'AREA-032', area_name: 'Thoraipakkam', ward_id: 'WARD-027', latitude: 12.927, longitude: 80.231, postal_code: '600097' },
  { area_id: 'AREA-033', area_name: 'Tambaram', ward_id: 'WARD-028', latitude: 12.9249, longitude: 80.1, postal_code: '600045' },
];

export const PLACES = [
  // WARD-001 · Anna Nagar Central
  { place_id: 'PLACE-001', place_name: 'Anna Nagar Roundabout', street: '2nd Avenue', type: 'junction', area_id: 'AREA-001', ward_id: 'WARD-001', area: 'Anna Nagar', ward_name: 'Anna Nagar Central', latitude: 13.0855, longitude: 80.2105, postal_code: '600040', keywords: 'roundtana roundabout anna nagar circle' },
  { place_id: 'PLACE-002', place_name: 'Anna Nagar Tower', type: 'landmark', area_id: 'AREA-001', ward_id: 'WARD-001', area: 'Anna Nagar', ward_name: 'Anna Nagar Central', latitude: 13.087, longitude: 80.218, postal_code: '600040', keywords: 'tower park anna nagar' },
  { place_id: 'PLACE-003', place_name: '2nd Avenue', type: 'street', area_id: 'AREA-001', ward_id: 'WARD-001', area: 'Anna Nagar', ward_name: 'Anna Nagar Central', latitude: 13.0832, longitude: 80.214, postal_code: '600040', keywords: 'second avenue road anna nagar east' },
  { place_id: 'PLACE-004', place_name: 'Shanthi Colony', type: 'neighborhood', area_id: 'AREA-001', ward_id: 'WARD-001', area: 'Anna Nagar', ward_name: 'Anna Nagar Central', latitude: 13.082, longitude: 80.2085, postal_code: '600040', keywords: 'shanthi colony residential anna nagar' },
  // WARD-002 · Anna Nagar West
  { place_id: 'PLACE-005', place_name: 'Anna Nagar West', type: 'neighborhood', area_id: 'AREA-002', ward_id: 'WARD-002', area: 'Anna Nagar West', ward_name: 'Anna Nagar West', latitude: 13.0878, longitude: 80.1998, postal_code: '600040', keywords: 'west anna nagar' },
  { place_id: 'PLACE-006', place_name: 'Anna Nagar West Bus Depot', type: 'bus_stop', area_id: 'AREA-002', ward_id: 'WARD-002', area: 'Anna Nagar West', ward_name: 'Anna Nagar West', latitude: 13.089, longitude: 80.1965, postal_code: '600040', keywords: 'bus depot west anna nagar' },
  // WARD-003 · T Nagar Central
  { place_id: 'PLACE-007', place_name: 'T Nagar Bus Stand', type: 'bus_stop', area_id: 'AREA-003', ward_id: 'WARD-003', area: 'T Nagar', ward_name: 'T Nagar Central', latitude: 13.041, longitude: 80.233, postal_code: '600017', keywords: 'bus stand t nagar thyagaraya' },
  { place_id: 'PLACE-008', place_name: 'Pondy Bazaar', street: 'Thyagaraya Road', type: 'market', area_id: 'AREA-003', ward_id: 'WARD-003', area: 'T Nagar', ward_name: 'T Nagar Central', latitude: 13.0415, longitude: 80.2337, postal_code: '600017', keywords: 'pondy bazaar shopping t nagar' },
  { place_id: 'PLACE-009', place_name: 'Panagal Park', type: 'park', area_id: 'AREA-003', ward_id: 'WARD-003', area: 'T Nagar', ward_name: 'T Nagar Central', latitude: 13.0417, longitude: 80.2317, postal_code: '600017', keywords: 'panagal park t nagar' },
  // WARD-004 · Egmore
  { place_id: 'PLACE-010', place_name: 'Chennai Egmore Railway Station', type: 'railway', area_id: 'AREA-004', ward_id: 'WARD-004', area: 'Egmore', ward_name: 'Egmore', latitude: 13.078, longitude: 80.261, postal_code: '600008', keywords: 'egmore station train railway' },
  { place_id: 'PLACE-011', place_name: 'Government Museum Egmore', type: 'museum', area_id: 'AREA-004', ward_id: 'WARD-004', area: 'Egmore', ward_name: 'Egmore', latitude: 13.0735, longitude: 80.2605, postal_code: '600008', keywords: 'museum egmore pantheon' },
  // WARD-005 · Park Town
  { place_id: 'PLACE-012', place_name: 'Chennai Central Railway Station', type: 'railway', area_id: 'AREA-005', ward_id: 'WARD-005', area: 'Park Town', ward_name: 'Park Town', latitude: 13.0822, longitude: 80.2755, postal_code: '600003', keywords: 'central station train railway park town' },
  { place_id: 'PLACE-013', place_name: 'Ripon Building', type: 'government', area_id: 'AREA-005', ward_id: 'WARD-005', area: 'Park Town', ward_name: 'Park Town', latitude: 13.0818, longitude: 80.2707, postal_code: '600003', keywords: ' Ripon building corporation chennai' },
  { place_id: 'PLACE-014', place_name: 'Government General Hospital', type: 'hospital', area_id: 'AREA-005', ward_id: 'WARD-005', area: 'Park Town', ward_name: 'Park Town', latitude: 13.081, longitude: 80.2765, postal_code: '600003', keywords: 'general hospital gh medical park town' },
  // WARD-006 · George Town
  { place_id: 'PLACE-015', place_name: "Parry's Corner", type: 'junction', area_id: 'AREA-006', ward_id: 'WARD-006', area: 'George Town', ward_name: 'George Town', latitude: 13.0917, longitude: 80.287, postal_code: '600001', keywords: 'parry corner george town junction' },
  { place_id: 'PLACE-016', place_name: 'Broadway Market', street: 'Kasi Chetty Street', type: 'market', area_id: 'AREA-006', ward_id: 'WARD-006', area: 'George Town', ward_name: 'George Town', latitude: 13.0925, longitude: 80.2865, postal_code: '600001', keywords: 'broadway market george town wholesale' },
  // WARD-007 · Triplicane
  { place_id: 'PLACE-017', place_name: 'Marina Beach', type: 'landmark', area_id: 'AREA-007', ward_id: 'WARD-007', area: 'Triplicane', ward_name: 'Triplicane', latitude: 13.05, longitude: 80.2824, postal_code: '600005', keywords: 'marina beach sand promenade' },
  { place_id: 'PLACE-018', place_name: 'Marina Lighthouse', type: 'landmark', area_id: 'AREA-007', ward_id: 'WARD-007', area: 'Triplicane', ward_name: 'Triplicane', latitude: 13.0554, longitude: 80.2818, postal_code: '600005', keywords: 'lighthouse marina beach' },
  // WARD-008 · Royapettah (incl. Mylapore, Mount Road)
  { place_id: 'PLACE-019', place_name: 'Royapettah Junction', type: 'junction', area_id: 'AREA-008', ward_id: 'WARD-008', area: 'Royapettah', ward_name: 'Royapettah', latitude: 13.056, longitude: 80.2645, postal_code: '600014', keywords: 'royapettah signal junction' },
  { place_id: 'PLACE-020', place_name: 'Kapaleeshwarar Temple', street: 'Kutchery Road', type: 'temple', area_id: 'AREA-009', ward_id: 'WARD-008', area: 'Mylapore', ward_name: 'Royapettah', latitude: 13.0336, longitude: 80.269, postal_code: '600004', keywords: 'kapali temple mylapore kutchery' },
  { place_id: 'PLACE-021', place_name: 'Anna Salai', street: 'Mount Road', type: 'street', area_id: 'AREA-010', ward_id: 'WARD-008', area: 'Mount Road', ward_name: 'Royapettah', latitude: 13.044, longitude: 80.247, postal_code: '600002', keywords: 'anna salai mount road street' },
  // WARD-009 · Purasawalkam
  { place_id: 'PLACE-022', place_name: 'Purasawalkam Market', type: 'market', area_id: 'AREA-011', ward_id: 'WARD-009', area: 'Purasawalkam', ward_name: 'Purasawalkam', latitude: 13.0855, longitude: 80.256, postal_code: '600007', keywords: 'purasawalkam market shopping' },
  { place_id: 'PLACE-023', place_name: 'Kellys Junction', type: 'junction', area_id: 'AREA-011', ward_id: 'WARD-009', area: 'Purasawalkam', ward_name: 'Purasawalkam', latitude: 13.0855, longitude: 80.251, postal_code: '600010', keywords: 'kellys junction purasawalkam' },
  // WARD-010 · Nungambakkam (incl. Kodambakkam)
  { place_id: 'PLACE-024', place_name: 'Nungambakkam Railway Station', type: 'railway', area_id: 'AREA-012', ward_id: 'WARD-010', area: 'Nungambakkam', ward_name: 'Nungambakkam', latitude: 13.0712, longitude: 80.2424, postal_code: '600034', keywords: 'nungambakkam station railway' },
  { place_id: 'PLACE-025', place_name: 'Loyola College', type: 'college', area_id: 'AREA-012', ward_id: 'WARD-010', area: 'Nungambakkam', ward_name: 'Nungambakkam', latitude: 13.0585, longitude: 80.242, postal_code: '600034', keywords: 'loyola college nungambakkam' },
  { place_id: 'PLACE-026', place_name: 'Kodambakkam Bridge', type: 'junction', area_id: 'AREA-013', ward_id: 'WARD-010', area: 'Kodambakkam', ward_name: 'Nungambakkam', latitude: 13.0524, longitude: 80.2209, postal_code: '600024', keywords: 'kodambakkam bridge junction' },
  // WARD-011 · Perambur
  { place_id: 'PLACE-027', place_name: 'Perambur Railway Station', type: 'railway', area_id: 'AREA-014', ward_id: 'WARD-011', area: 'Perambur', ward_name: 'Perambur', latitude: 13.117, longitude: 80.232, postal_code: '600011', keywords: 'perambur station railway' },
  { place_id: 'PLACE-028', place_name: 'Perambur Market', type: 'market', area_id: 'AREA-014', ward_id: 'WARD-011', area: 'Perambur', ward_name: 'Perambur', latitude: 13.1195, longitude: 80.233, postal_code: '600011', keywords: 'perambur market' },
  // WARD-012 · Kolathur
  { place_id: 'PLACE-029', place_name: 'Kolathur Main Road', type: 'street', area_id: 'AREA-015', ward_id: 'WARD-012', area: 'Kolathur', ward_name: 'Kolathur', latitude: 13.1245, longitude: 80.2125, postal_code: '600099', keywords: 'kolathur main road street' },
  // WARD-013 · Madhavaram
  { place_id: 'PLACE-030', place_name: 'Madhavaram Bus Terminus', type: 'bus_stop', area_id: 'AREA-016', ward_id: 'WARD-013', area: 'Madhavaram', ward_name: 'Madhavaram', latitude: 13.1465, longitude: 80.2305, postal_code: '600060', keywords: 'madhavaram bus terminus' },
  // WARD-014 · Tondiarpet
  { place_id: 'PLACE-031', place_name: 'Tondiarpet Market', type: 'market', area_id: 'AREA-017', ward_id: 'WARD-014', area: 'Tondiarpet', ward_name: 'Tondiarpet', latitude: 13.1265, longitude: 80.2895, postal_code: '600081', keywords: 'tondiarpet market' },
  // WARD-015 · Washermanpet
  { place_id: 'PLACE-032', place_name: 'Washermanpet Railway Station', type: 'railway', area_id: 'AREA-018', ward_id: 'WARD-015', area: 'Washermanpet', ward_name: 'Washermanpet', latitude: 13.113, longitude: 80.2855, postal_code: '600021', keywords: 'washermanpet station railway' },
  { place_id: 'PLACE-033', place_name: 'Washermanpet Market', type: 'market', area_id: 'AREA-018', ward_id: 'WARD-015', area: 'Washermanpet', ward_name: 'Washermanpet', latitude: 13.1095, longitude: 80.2865, postal_code: '600021', keywords: 'washermanpet market wholesale' },
  // WARD-016 · Mogappair
  { place_id: 'PLACE-034', place_name: 'Mogappair Junction', type: 'junction', area_id: 'AREA-019', ward_id: 'WARD-016', area: 'Mogappair', ward_name: 'Mogappair', latitude: 13.081, longitude: 80.182, postal_code: '600037', keywords: 'mogappair junction' },
  { place_id: 'PLACE-035', place_name: 'Mogappair East', type: 'neighborhood', area_id: 'AREA-019', ward_id: 'WARD-016', area: 'Mogappair', ward_name: 'Mogappair', latitude: 13.0835, longitude: 80.1855, postal_code: '600037', keywords: 'mogappair east residential' },
  // WARD-017 · Ambattur
  { place_id: 'PLACE-036', place_name: 'Ambattur Industrial Estate', type: 'industrial', area_id: 'AREA-020', ward_id: 'WARD-017', area: 'Ambattur', ward_name: 'Ambattur', latitude: 13.115, longitude: 80.1565, postal_code: '600058', keywords: 'ambattur estate industrial' },
  { place_id: 'PLACE-037', place_name: 'Ambattur Lake', type: 'lake', area_id: 'AREA-020', ward_id: 'WARD-017', area: 'Ambattur', ward_name: 'Ambattur', latitude: 13.118, longitude: 80.15, postal_code: '600053', keywords: 'ambattur lake' },
  // WARD-018 · Avadi
  { place_id: 'PLACE-038', place_name: 'Avadi Railway Station', type: 'railway', area_id: 'AREA-021', ward_id: 'WARD-018', area: 'Avadi', ward_name: 'Avadi', latitude: 13.1147, longitude: 80.109, postal_code: '600054', keywords: 'avadi station railway' },
  { place_id: 'PLACE-039', place_name: 'Avadi Bus Stand', type: 'bus_stop', area_id: 'AREA-021', ward_id: 'WARD-018', area: 'Avadi', ward_name: 'Avadi', latitude: 13.112, longitude: 80.109, postal_code: '600054', keywords: 'avadi bus stand' },
  // WARD-019 · Porur
  { place_id: 'PLACE-040', place_name: 'Porur Junction', type: 'junction', area_id: 'AREA-022', ward_id: 'WARD-019', area: 'Porur', ward_name: 'Porur', latitude: 13.0375, longitude: 80.1565, postal_code: '600116', keywords: 'porur junction mount poonamallee' },
  { place_id: 'PLACE-041', place_name: 'Porur Lake', type: 'lake', area_id: 'AREA-022', ward_id: 'WARD-019', area: 'Porur', ward_name: 'Porur', latitude: 13.035, longitude: 80.153, postal_code: '600116', keywords: 'porur lake' },
  // WARD-020 · Koyambedu
  { place_id: 'PLACE-042', place_name: 'Koyambedu Bus Terminus (CMBT)', type: 'bus_stop', area_id: 'AREA-023', ward_id: 'WARD-020', area: 'Koyambedu', ward_name: 'Koyambedu', latitude: 13.0674, longitude: 80.1948, postal_code: '600107', keywords: 'cmbt koyambedu bus terminus' },
  { place_id: 'PLACE-043', place_name: 'Koyambedu Wholesale Market', type: 'market', area_id: 'AREA-023', ward_id: 'WARD-020', area: 'Koyambedu', ward_name: 'Koyambedu', latitude: 13.07, longitude: 80.193, postal_code: '600107', keywords: 'koyambedu market wholesale' },
  // WARD-021 · Saidapet
  { place_id: 'PLACE-044', place_name: 'Saidapet Bridge', type: 'junction', area_id: 'AREA-024', ward_id: 'WARD-021', area: 'Saidapet', ward_name: 'Saidapet', latitude: 13.02, longitude: 80.226, postal_code: '600015', keywords: 'saidapet bridge junction' },
  { place_id: 'PLACE-045', place_name: 'Saidapet Market', type: 'market', area_id: 'AREA-024', ward_id: 'WARD-021', area: 'Saidapet', ward_name: 'Saidapet', latitude: 13.0215, longitude: 80.2225, postal_code: '600015', keywords: 'saidapet market' },
  // WARD-022 · Guindy
  { place_id: 'PLACE-046', place_name: 'Guindy National Park', type: 'park', area_id: 'AREA-025', ward_id: 'WARD-022', area: 'Guindy', ward_name: 'Guindy', latitude: 13.006, longitude: 80.239, postal_code: '600032', keywords: 'guindy national park forest children park' },
  { place_id: 'PLACE-047', place_name: 'Guindy Race Course', type: 'landmark', area_id: 'AREA-025', ward_id: 'WARD-022', area: 'Guindy', ward_name: 'Guindy', latitude: 13.0075, longitude: 80.2208, postal_code: '600032', keywords: 'guindy race course' },
  { place_id: 'PLACE-048', place_name: 'Guindy Industrial Estate', type: 'industrial', area_id: 'AREA-025', ward_id: 'WARD-022', area: 'Guindy', ward_name: 'Guindy', latitude: 13.01, longitude: 80.212, postal_code: '600032', keywords: 'guindy industrial estate' },
  // WARD-023 · Adyar (incl. Besant Nagar)
  { place_id: 'PLACE-049', place_name: 'Adyar Bus Depot', type: 'bus_stop', area_id: 'AREA-026', ward_id: 'WARD-023', area: 'Adyar', ward_name: 'Adyar', latitude: 13.0085, longitude: 80.2575, postal_code: '600020', keywords: 'adyar bus depot' },
  { place_id: 'PLACE-050', place_name: "Elliot's Beach", street: "Elliot's Beach Road", type: 'landmark', area_id: 'AREA-027', ward_id: 'WARD-023', area: 'Besant Nagar', ward_name: 'Adyar', latitude: 13.0002, longitude: 80.2668, postal_code: '600090', keywords: 'elliots beach besant nagar' },
  { place_id: 'PLACE-051', place_name: 'IIT Madras', type: 'college', area_id: 'AREA-026', ward_id: 'WARD-023', area: 'Adyar', ward_name: 'Adyar', latitude: 12.9916, longitude: 80.2336, postal_code: '600036', keywords: 'iit madras indian institute technology' },
  // WARD-024 · Velachery
  { place_id: 'PLACE-052', place_name: 'Phoenix Marketcity', type: 'shopping', area_id: 'AREA-028', ward_id: 'WARD-024', area: 'Velachery', ward_name: 'Velachery', latitude: 12.991, longitude: 80.217, postal_code: '600042', keywords: 'phoenix marketcity mall velachery' },
  { place_id: 'PLACE-053', place_name: 'Velachery Lake', type: 'lake', area_id: 'AREA-028', ward_id: 'WARD-024', area: 'Velachery', ward_name: 'Velachery', latitude: 12.9795, longitude: 80.2135, postal_code: '600042', keywords: 'velachery lake' },
  // WARD-025 · Tharamani
  { place_id: 'PLACE-054', place_name: 'Tidel Park', type: 'it_park', area_id: 'AREA-029', ward_id: 'WARD-025', area: 'Tharamani', ward_name: 'Tharamani', latitude: 12.9915, longitude: 80.247, postal_code: '600113', keywords: 'tidel park it tharamani' },
  { place_id: 'PLACE-055', place_name: 'Tharamani Bus Stop', type: 'bus_stop', area_id: 'AREA-029', ward_id: 'WARD-025', area: 'Tharamani', ward_name: 'Tharamani', latitude: 12.986, longitude: 80.2425, postal_code: '600113', keywords: 'tharamani bus stop' },
  // WARD-026 · Meenambakkam
  { place_id: 'PLACE-056', place_name: 'Chennai International Airport', type: 'airport', area_id: 'AREA-030', ward_id: 'WARD-026', area: 'Meenambakkam', ward_name: 'Meenambakkam', latitude: 12.9941, longitude: 80.1709, postal_code: '600027', keywords: 'chennai airport maa meenambakkam flight' },
  { place_id: 'PLACE-057', place_name: 'Meenambakkam Railway Station', type: 'railway', area_id: 'AREA-030', ward_id: 'WARD-026', area: 'Meenambakkam', ward_name: 'Meenambakkam', latitude: 12.9875, longitude: 80.17, postal_code: '600027', keywords: 'meenambakkam station railway' },
  // WARD-027 · Sholinganallur (incl. Thoraipakkam)
  { place_id: 'PLACE-058', place_name: 'Sholinganallur Junction', type: 'junction', area_id: 'AREA-031', ward_id: 'WARD-027', area: 'Sholinganallur', ward_name: 'Sholinganallur', latitude: 12.901, longitude: 80.227, postal_code: '600119', keywords: 'sholinganallur junction' },
  { place_id: 'PLACE-059', place_name: 'OMR Junction', street: 'Rajiv Gandhi Salai (OMR)', area_id: 'AREA-032', ward_id: 'WARD-027', area: 'Thoraipakkam', ward_name: 'Sholinganallur', latitude: 12.927, longitude: 80.231, postal_code: '600097', keywords: 'omr junction thoraipakkam perungudi' },
  // WARD-028 · Tambaram
  { place_id: 'PLACE-060', place_name: 'Tambaram Railway Station', type: 'railway', area_id: 'AREA-033', ward_id: 'WARD-028', area: 'Tambaram', ward_name: 'Tambaram', latitude: 12.9255, longitude: 80.1105, postal_code: '600045', keywords: 'tambaram station railway suburb' },
  { place_id: 'PLACE-061', place_name: 'Tambaram Bus Stand', type: 'bus_stop', area_id: 'AREA-033', ward_id: 'WARD-028', area: 'Tambaram', ward_name: 'Tambaram', latitude: 12.925, longitude: 80.105, postal_code: '600045', keywords: 'tambaram bus stand' },
];

/** Fast lookups over the seed catalog (admin edits layer on top in wardDirectory). */
export const WARD_INDEX = Object.fromEntries(WARDS.map((w) => [w.ward_id, w]));
export const AREA_INDEX = Object.fromEntries(AREAS.map((a) => [a.area_id, a]));
export const PLACE_INDEX = Object.fromEntries(PLACES.map((p) => [p.place_id, p]));

export const wardById = (ward_id) => WARD_INDEX[ward_id] || null;
export const areaById = (area_id) => AREA_INDEX[area_id] || null;
export const placeById = (place_id) => PLACE_INDEX[place_id] || null;

export const areasOfWard = (ward_id) => AREAS.filter((a) => a.ward_id === ward_id);
export const placesOfWard = (ward_id) => PLACES.filter((p) => p.ward_id === ward_id);

/** Major labels drawn on the city map (existing IssueCityMap import). */
export const MAP_LABELS = [
  'Chennai Central Railway Station',
  'Chennai Egmore Railway Station',
  'Anna Nagar Tower',
  'Marina Beach',
  'Chennai International Airport',
  'T Nagar',
  'Adyar',
  'Guindy',
  'Velachery',
  'Tambaram',
  'Porur',
  'Nungambakkam',
]
  .map((name) => {
    const place = PLACES.find((p) => p.place_name === name);
    if (place) return { name, latitude: place.latitude, longitude: place.longitude };
    const area = AREAS.find((a) => a.area_name === name);
    if (area) return { name, latitude: area.latitude, longitude: area.longitude };
    return null;
  })
  .filter(Boolean);
