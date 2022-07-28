const turf = require('@turf/turf');
const fs = require('fs');

const TURF_UNIT = 'kilometers';

const GEO_TYPES = {
  MULTI_POLYGON: 'MultiPolygon',
  POLYGON: 'Polygon',
  POINT: 'Point',
  LINE_STRING: 'LineString',
};

const FEATURE_COLLECTION = 'FeatureCollection';
const FEATURE = 'Feature';

function getPolygons(geolocation) {
  const { coordinates, type, geometry, radiusKm = 5 } = geolocation;
  if (type === GEO_TYPES.POLYGON) {
    return [turf.polygon(coordinates)];
  }

  if (type === FEATURE && geometry.type === GEO_TYPES.POLYGON) {
    return [geometry];
  }

  // We got only the point for city, lets create a circle...
  if (type === GEO_TYPES.POINT) {
    return [turf.circle(coordinates, radiusKm, { units: TURF_UNIT })];
  }

  // Line (road or street) - find midpoint and length and create circle
  if (type === GEO_TYPES.LINE_STRING) {
    const firstPoint = turf.point(coordinates[0]);
    const lastPoint = turf.point(coordinates[coordinates.length - 1]);
    const midPoint = turf.midpoint(firstPoint, lastPoint);

    const line = turf.lineString(coordinates);
    const length = turf.length(line, { units: TURF_UNIT });

    return [turf.circle(midPoint, length, { units: TURF_UNIT })];
  }

  // Multipolygon
  return coordinates.map((coords) => turf.polygon(coords));
}
const VIETNAM_GEOLOCATIONS = JSON.parse(
  fs.readFileSync('./const-data/vietnam-polygon.json')
);
const VIETNAM_POLYGONS = getPolygons(VIETNAM_GEOLOCATIONS[0].geojson);

function getPolygonFromBoundingBox(boundingbox) {
  const numberBBox = boundingbox.map(Number);

  return [
    [
      [numberBBox[2], numberBBox[0]],
      [numberBBox[2], numberBBox[1]],
      [numberBBox[3], numberBBox[0]],
      [numberBBox[3], numberBBox[1]],
      [numberBBox[2], numberBBox[0]],
    ],
  ];
}

module.exports.checkInPolygon = (geolocation, coordinates) => {
  if (!geolocation || !coordinates || !coordinates.lon || !coordinates.lat) {
    return true;
  }
  const point = turf.point([coordinates.lon, coordinates.lat]);
  let included = false;
  const polygons = getPolygons(geolocation);
  for (const polygon of polygons) {
    included = turf.booleanContains(polygon, point);
    if (included) break;
  }
  return included;
};

module.exports.isInVietnam = ({ lon, lat }) => {
  const point = turf.point([lon, lat]);
  let included = false;
  for (const polygon of VIETNAM_POLYGONS) {
    included = turf.booleanContains(polygon, point);
    if (included) break;
  }
  return included;
};

module.exports.getGeolocation = async () => {
  const geolocationFull = vietnamPolygon[0];
  return geolocationFull;
};

function distanceByZoom(lat, zoom) {
  return 156543.03392 * (Math.cos((lat * Math.PI) / 180) / 2 ** zoom);
}

module.exports.getGeoJson = (geolocationFull) => {
  let { geojson, boundingbox } = geolocationFull;

  if (geojson) {
    return geojson;
  }

  if (!boundingbox) {
    throw new Error(
      `[Geolocation]: Could not find geojson or bounding box in geolocation for ${geolocationFull.display_name}`
    );
  }
  return {
    coordinates: getPolygonFromBoundingBox(boundingbox),
    type: GEO_TYPES.POLYGON,
    geometry: undefined,
  };
};

module.exports.findPointsInPolygon = async (geolocation, zoom) => {
  const { coordinates, type } = geolocation;
  if (!coordinates && ![FEATURE_COLLECTION, FEATURE].includes(type)) return [];

  const points = [];
  // If we have a point add it to result
  if (type === GEO_TYPES.POINT) {
    const [lon, lat] = coordinates;
    points.push({ lon, lat });
  }
  // If we have a line add a first and last point
  if (type === GEO_TYPES.LINE_STRING) {
    const pointsToProcess = [
      coordinates[0],
      coordinates[coordinates.length - 1],
    ];
    pointsToProcess.forEach((point) => {
      const [lon, lat] = point;
      points.push({ lon, lat });
    });
  }
  try {
    const polygons = getPolygons(geolocation);

    polygons.forEach(() => {
      const bbox = turf.bbox(polygon);
      // distance in meters per pixel * viewport / 1000 meters
      let distanceKilometers = distanceByZoom(bbox[3], zoom) * (800 / 1000);
      // Creates grid of points inside given polygon
      let pointGrid = null;
      // point grid can be empty for to large distance.
      while (distanceKilometers > 0) {
        console.log('distanceKilometers', { distanceKilometers });
        // Use lower distance for points
        const distance =
          geolocation.type === GEO_TYPES.POINT
            ? distanceKilometers / 2
            : distanceKilometers;

        const options = {
          units: 'kilometers',
          mask: polygon,
        };
        pointGrid = turf.pointGrid(bbox, distance, options);

        if (pointGrid.features && pointGrid.features.length > 0) break;
        distanceKilometers -= 1;
      }
      if (pointGrid) {
        pointGrid.features.forEach((feature) => {
          const { geometry } = feature;
          if (geometry) {
            const [lon, lat] = geometry.coordinates;
            points.push({ lon, lat });
            // points.push(feature); // http://geojson.io is nice tool to check found points on map
          }
        });
      }
    });
  } catch (e) {
    console.error(e, 'Failed to create point grid', {
      location,
      zoom,
    });
  }
  return points;
};
