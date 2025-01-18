import * as THREE from "three";
import { Octree } from "three/examples/jsm/math/Octree.js";
import { OctreeHelper } from "three/examples/jsm/helpers/OctreeHelper.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";

class FastIntersectionDetector {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.tempMatrix = new THREE.Matrix4();
    this.meshes = [];
  }

  setupOctree(scene) {
    // Store meshes for intersection testing
    this.meshes = [];
    scene.traverse((object) => {
      if (object.isMesh) {
        this.meshes.push(object);
      }
    });
  }

  findIntersection(elementA, elementB) {
    // Get all meshes from both elements
    const meshesA = [];
    const meshesB = [];

    elementA.traverse((child) => {
      if (child.isMesh && child.geometry) {
        meshesA.push(child);
      }
    });

    elementB.traverse((child) => {
      if (child.isMesh && child.geometry) {
        meshesB.push(child);
      }
    });

    if (meshesA.length === 0 || meshesB.length === 0) {
      return null;
    }

    // Quick AABB check first using the parent objects
    const boxA = new THREE.Box3().setFromObject(elementA);
    const boxB = new THREE.Box3().setFromObject(elementB);

    if (!boxA.intersectsBox(boxB)) {
      return null;
    }

    // Check intersections between all mesh pairs
    const allIntersectionPoints = [];

    for (const meshA of meshesA) {
      for (const meshB of meshesB) {
        const intersectionPoints = this.raycastIntersection(meshA, meshB);
        if (intersectionPoints && intersectionPoints.length > 0) {
          allIntersectionPoints.push(...intersectionPoints);
        }
      }
    }

    if (allIntersectionPoints.length === 0) {
      return null;
    }

    // Create intersection visualization
    return this.createIntersectionVisualization(allIntersectionPoints);
  }

  raycastIntersection(meshA, meshB) {
    if (!meshA.geometry || !meshB.geometry) {
      return null;
    }

    const intersectionPoints = [];
    const v = new THREE.Vector3();
    const positionA = meshA.geometry.attributes.position;

    // Define ray directions
    const rayDirections = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];

    // Sample vertices (use every nth vertex to improve performance)
    const stride = Math.max(1, Math.floor(positionA.count / 100)); // Sample up to 100 points

    for (let i = 0; i < positionA.count; i += stride) {
      v.fromBufferAttribute(positionA, i);
      v.applyMatrix4(meshA.matrixWorld);

      for (const direction of rayDirections) {
        this.raycaster.set(v, direction);
        const intersects = this.raycaster.intersectObject(meshB);

        if (intersects.length > 0) {
          intersectionPoints.push(intersects[0].point);
        }
      }
    }

    return intersectionPoints;
  }

  createIntersectionVisualization(points) {
    if (points.length === 0) return null;

    // Remove duplicate points within a small threshold
    const uniquePoints = [];
    const threshold = 0.01; // 1cm threshold

    for (const point of points) {
      let isDuplicate = false;
      for (const uniquePoint of uniquePoints) {
        if (point.distanceTo(uniquePoint) < threshold) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        uniquePoints.push(point);
      }
    }

    // Create point cloud for visualization
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        uniquePoints.flatMap((p) => [p.x, p.y, p.z]),
        3
      )
    );

    // Create lines connecting intersection points
    const lineGeometry = new THREE.BufferGeometry();
    const linePoints = [];
    for (let i = 0; i < uniquePoints.length - 1; i++) {
      linePoints.push(uniquePoints[i], uniquePoints[i + 1]);
    }
    lineGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        linePoints.flatMap((p) => [p.x, p.y, p.z]),
        3
      )
    );

    return {
      type: this.classifyIntersectionType(uniquePoints),
      points: geometry,
      lines: lineGeometry,
      measurements: this.calculateMeasurements(uniquePoints),
    };
  }

  classifyIntersectionType(points) {
    if (points.length <= 2) return "point";
    if (points.length <= 4) return "line";

    // Calculate principal components to determine dimensionality
    const centroid = new THREE.Vector3();
    points.forEach((p) => centroid.add(p));
    centroid.divideScalar(points.length);

    const covariance = new THREE.Matrix3();
    points.forEach((p) => {
      const diff = p.clone().sub(centroid);
      covariance.elements[0] += diff.x * diff.x;
      covariance.elements[4] += diff.y * diff.y;
      covariance.elements[8] += diff.z * diff.z;
      covariance.elements[1] += diff.x * diff.y;
      covariance.elements[3] += diff.y * diff.x;
      covariance.elements[2] += diff.x * diff.z;
      covariance.elements[6] += diff.z * diff.x;
      covariance.elements[5] += diff.y * diff.z;
      covariance.elements[7] += diff.z * diff.y;
    });

    // Normalize
    for (let i = 0; i < 9; i++) {
      covariance.elements[i] /= points.length;
    }

    const eigenvalues = this.getEigenvalues(covariance);
    const [max, mid, min] = eigenvalues.sort((a, b) => b - a);

    if (max / min > 10 && mid / min > 5) return "surface";
    if (max / mid > 10) return "line";
    return "point";
  }

  calculateMeasurements(points) {
    const bbox = new THREE.Box3();
    points.forEach((p) => bbox.expandByPoint(p));

    const size = new THREE.Vector3();
    bbox.getSize(size);

    return {
      length: Math.max(size.x, size.y, size.z),
      area: this.calculateApproximateArea(points),
      boundingBox: bbox,
    };
  }

  calculateApproximateArea(points) {
    if (points.length < 3) return 0;

    // Project points onto the most significant plane
    const centroid = new THREE.Vector3();
    points.forEach((p) => centroid.add(p));
    centroid.divideScalar(points.length);

    // Calculate normal using the first three non-collinear points
    const v1 = new THREE.Vector3().subVectors(points[1], points[0]);
    const v2 = new THREE.Vector3().subVectors(points[2], points[0]);
    const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();

    // Project points onto plane
    const projectedPoints = points.map((p) => {
      const projected = p.clone();
      const toPoint = new THREE.Vector3().subVectors(projected, centroid);
      const dist = toPoint.dot(normal);
      projected.sub(normal.clone().multiplyScalar(dist));
      return projected;
    });

    // Calculate area using the shoelace formula
    let area = 0;
    for (let i = 0; i < projectedPoints.length; i++) {
      const j = (i + 1) % projectedPoints.length;
      area += projectedPoints[i].x * projectedPoints[j].y;
      area -= projectedPoints[j].x * projectedPoints[i].y;
    }

    return Math.abs(area) / 2;
  }

  getEigenvalues(matrix) {
    // Simple 3x3 eigenvalue calculation
    const m = matrix.elements;
    const p1 = m[0] + m[4] + m[8];
    const p2 =
      m[0] * m[4] +
      m[4] * m[8] +
      m[8] * m[0] -
      m[1] * m[3] -
      m[2] * m[6] -
      m[5] * m[7];
    const p3 =
      m[0] * m[4] * m[8] +
      m[1] * m[5] * m[6] +
      m[2] * m[3] * m[7] -
      m[2] * m[4] * m[6] -
      m[1] * m[3] * m[8] -
      m[0] * m[5] * m[7];

    // Cardano's formula for cubic equation
    const a = 1;
    const b = -p1;
    const c = p2;
    const d = -p3;

    const p = (3 * a * c - b * b) / (3 * a * a);
    const q =
      (2 * b * b * b - 9 * a * b * c + 27 * a * a * d) / (27 * a * a * a);

    const D = (q * q) / 4 + (p * p * p) / 27;

    if (D > 0) {
      const u = Math.cbrt(-q / 2 + Math.sqrt(D));
      const v = Math.cbrt(-q / 2 - Math.sqrt(D));
      return [
        u + v - b / (3 * a),
        -(u + v) / 2 - b / (3 * a),
        -(u + v) / 2 - b / (3 * a),
      ];
    } else {
      const phi = Math.acos(-q / (2 * Math.sqrt((-p * p * p) / 27)));
      const s = 2 * Math.sqrt(-p / 3);
      return [
        s * Math.cos(phi / 3) - b / (3 * a),
        s * Math.cos((phi + 2 * Math.PI) / 3) - b / (3 * a),
        s * Math.cos((phi + 4 * Math.PI) / 3) - b / (3 * a),
      ];
    }
  }
}

class IntersectionVisualizer {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // Define colors per connection type
    this.colors = {
      point: 0xff3366, // Pink-Red for points
      line: 0x33ff66, // Green for lines
      surface: 0x3366ff, // Blue for surfaces
    };

    // Visibility settings
    this.typeVisibility = {
      point: true,
      line: true,
      surface: true,
    };

    this.showLabelsGlobal = false;
    this.connectionVisualizations = new Map();

    // Materials for each connection type
    this.materials = {
      point: {
        normal: new THREE.PointsMaterial({
          size: 10,
          color: this.colors.point,
          transparent: true,
          opacity: 0.8,
          depthTest: false,
          sizeAttenuation: false,
        }),
        highlighted: new THREE.PointsMaterial({
          size: 15,
          color: this.colors.point,
          transparent: true,
          opacity: 1,
          depthTest: false,
          sizeAttenuation: false,
        }),
      },
      line: {
        normal: new THREE.LineBasicMaterial({
          color: this.colors.line,
          transparent: true,
          opacity: 0.8,
          depthTest: false,
          linewidth: 2,
        }),
        highlighted: new THREE.LineBasicMaterial({
          color: this.colors.line,
          transparent: true,
          opacity: 1,
          depthTest: false,
          linewidth: 3,
        }),
      },
      surface: {
        normal: new THREE.MeshBasicMaterial({
          color: this.colors.surface,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide,
          depthTest: false,
        }),
        highlighted: new THREE.MeshPhongMaterial({
          color: this.colors.surface,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
          depthTest: true,
          shininess: 100,
          specular: 0xffffff,
          emissive: this.colors.surface,
          emissiveIntensity: 0.3,
        }),
      },
    };

    // Initialize label renderer
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.position = "absolute";
    this.labelRenderer.domElement.style.top = "0";
    this.labelRenderer.domElement.style.pointerEvents = "none";
    document.body.appendChild(this.labelRenderer.domElement);

    // Handle window resize
    window.addEventListener("resize", () => {
      this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Store labels and their visibility states
    this.labels = new Map();
    this.hoveredVisualization = null;
    this.isConnectionMode = false;
  }

  setTypeVisibility(type, visible) {
    this.typeVisibility[type] = visible;

    // Update visibility of all visualizations of this type
    this.labels.forEach((label, visualization) => {
      const visType = this.getVisualizationType(visualization);
      if (visType === type) {
        if (visualization.points) {
          visualization.points.visible = visible;
        }
        if (visualization.lines) {
          visualization.lines.visible = visible;
        }
        if (visualization.surface) {
          visualization.surface.visible = visible;
        }

        // Update label visibility
        if (label && label.element) {
          if (visible && this.showLabelsGlobal) {
            label.element.style.display = "block";
          } else {
            label.element.style.display = "none";
          }
        }
      }
    });
  }

  setGlobalLabelVisibility(visible) {
    this.showLabelsGlobal = visible;
    this.updateLabelVisibility();
  }

  updateVisibility() {
    this.labels.forEach((label, visualization) => {
      const type = this.getVisualizationType(visualization);
      if (!type) return;

      if (visualization.points) {
        visualization.points.visible = this.typeVisibility.point;
      }
      if (visualization.lines) {
        visualization.lines.visible = this.typeVisibility.line;
      }
      if (visualization.surface) {
        visualization.surface.visible = this.typeVisibility.surface;
      }
    });
  }

  updateLabelVisibility() {
    this.labels.forEach((label, visualization) => {
      if (label && label.element) {
        if (this.showLabelsGlobal) {
          const type = this.getVisualizationType(visualization);
          if (type && this.typeVisibility[type]) {
            label.element.style.display = "block";
          }
        } else {
          label.element.style.display = "none";
        }
      }
    });
  }

  handleHover(intersection) {
    // Only handle hover if in connection mode
    if (!this.isConnectionMode) return;

    // Hide previous hover labels
    if (
      this.hoveredVisualization &&
      this.hoveredVisualization !==
        intersection?.object?.userData?.visualization
    ) {
      this.hideLabels(this.hoveredVisualization);
      this.hoveredVisualization = null;
    }

    // Handle new hover
    if (intersection && intersection.object.userData.isConnection) {
      const visualization = intersection.object.userData.visualization;
      const type = this.getVisualizationType(visualization);

      if (type && this.typeVisibility[type]) {
        this.hoveredVisualization = visualization;
        // Only show labels if global labels are enabled
        if (this.showLabelsGlobal) {
          this.showLabels(visualization);
          this.updateLabels();
        }
      }
    } else if (!intersection) {
      this.hoveredVisualization = null;
    }
  }

  setConnectionMode(enabled) {
    this.isConnectionMode = enabled;
    if (!enabled) {
      // Hide all labels when exiting connection mode
      this.showLabelsGlobal = false;
      this.labels.forEach((label, visualization) => {
        this.hideLabels(visualization);
      });
      this.hoveredVisualization = null;
    }
  }

  createLabel(text) {
    const label = document.createElement("div");
    label.className = "connection-label";
    label.textContent = text;
    return label;
  }

  visualize(intersection) {
    if (!intersection || !intersection.points) return null;

    const visualization = {};

    // Create points visualization
    if (intersection.type === "point") {
      visualization.points = new THREE.Points(
        intersection.points,
        new THREE.PointsMaterial({
          color: this.colors.point,
          size: 10,
          sizeAttenuation: false,
          transparent: true,
          opacity: 0.8,
          depthTest: false,
        })
      );
      visualization.points.userData.isConnection = true;
      visualization.points.userData.visualization = visualization;

      // Add measurement label (hidden by default)
      const center = new THREE.Vector3();
      const positions = intersection.points.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        center.add(
          new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2])
        );
      }
      center.divideScalar(positions.length / 3);

      const label = this.createLabel(
        `${intersection.measurements.length.toFixed(2)}m`
      );
      const labelObject = new CSS2DObject(label);
      labelObject.position.copy(center);
      visualization.label = labelObject;
      visualization.points.add(labelObject);
      this.labels.set(visualization, labelObject);
      label.style.display = "none"; // Ensure label starts hidden
    }

    // Create lines visualization
    if (intersection.type === "line") {
      visualization.lines = new THREE.LineSegments(
        intersection.points,
        new THREE.LineBasicMaterial({
          color: this.colors.line,
          transparent: true,
          opacity: 0.8,
          depthTest: false,
        })
      );
      visualization.lines.userData.isConnection = true;
      visualization.lines.userData.visualization = visualization;

      // Add measurement label (hidden by default)
      const positions = intersection.points.attributes.position.array;
      const start = new THREE.Vector3(positions[0], positions[1], positions[2]);
      const end = new THREE.Vector3(positions[3], positions[4], positions[5]);
      const midpoint = new THREE.Vector3().lerpVectors(start, end, 0.5);

      const label = this.createLabel(
        `${intersection.measurements.length.toFixed(2)}m`
      );
      const labelObject = new CSS2DObject(label);
      labelObject.position.copy(midpoint);
      visualization.label = labelObject;
      visualization.lines.add(labelObject);
      this.labels.set(visualization, labelObject);
      label.style.display = "none"; // Ensure label starts hidden
    }

    // Create surface visualization
    if (intersection.type === "surface") {
      visualization.surface = new THREE.Mesh(
        intersection.points,
        new THREE.MeshBasicMaterial({
          color: this.colors.surface,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide,
          depthTest: false,
        })
      );
      visualization.surface.userData.isConnection = true;
      visualization.surface.userData.visualization = visualization;

      // Calculate centroid for label position
      const centroid = new THREE.Vector3();
      const positions = intersection.points.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        centroid.add(
          new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2])
        );
      }
      centroid.divideScalar(positions.length / 3);

      // Add measurement label (hidden by default)
      const label = this.createLabel(
        `${intersection.measurements.area.toFixed(2)}m²`
      );
      const labelObject = new CSS2DObject(label);
      labelObject.position.copy(centroid);
      visualization.label = labelObject;
      visualization.surface.add(labelObject);
      this.labels.set(visualization, labelObject);
      label.style.display = "none"; // Ensure label starts hidden
    }

    // Add to scene
    if (visualization.points) this.scene.add(visualization.points);
    if (visualization.lines) this.scene.add(visualization.lines);
    if (visualization.surface) this.scene.add(visualization.surface);

    return visualization;
  }

  highlight(visualization) {
    if (!visualization) return;

    const type = this.getVisualizationType(visualization);
    if (!type) return;

    // Enhanced highlighting with glow effect
    if (visualization.points) {
      visualization.points.material = new THREE.PointsMaterial({
        color: this.colors[type],
        size: 15,
        sizeAttenuation: false,
        transparent: true,
        opacity: 1,
        depthTest: false,
      });
    }
    if (visualization.lines) {
      visualization.lines.material = new THREE.LineBasicMaterial({
        color: this.colors[type],
        transparent: true,
        opacity: 1,
        depthTest: false,
        linewidth: 3,
      });
      // Add glow effect for lines
      if (!visualization.lines.glow) {
        const glowMaterial = new THREE.LineBasicMaterial({
          color: this.colors[type],
          transparent: true,
          opacity: 0.3,
          depthTest: false,
          linewidth: 6,
        });
        const glowGeometry = visualization.lines.geometry.clone();
        const glowLines = new THREE.LineSegments(glowGeometry, glowMaterial);
        visualization.lines.add(glowLines);
        visualization.lines.glow = glowLines;
      }
      if (visualization.lines.glow) {
        visualization.lines.glow.visible = true;
      }
    }
    if (visualization.surface) {
      visualization.surface.material = new THREE.MeshPhongMaterial({
        color: this.colors[type],
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthTest: true,
        shininess: 100,
        specular: 0xffffff,
        emissive: this.colors[type],
        emissiveIntensity: 0.3,
      });
      // Add wireframe overlay for surfaces
      if (!visualization.surface.wireframe) {
        const wireframeMaterial = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.3,
          depthTest: false,
        });
        const wireframeGeometry = new THREE.WireframeGeometry(
          visualization.surface.geometry
        );
        const wireframe = new THREE.LineSegments(
          wireframeGeometry,
          wireframeMaterial
        );
        visualization.surface.add(wireframe);
        visualization.surface.wireframe = wireframe;
      }
      if (visualization.surface.wireframe) {
        visualization.surface.wireframe.visible = true;
      }
    }

    // Show labels for highlighted elements
    if (this.showLabelsGlobal) {
      this.showLabels(visualization);
    }
  }

  unhighlight(visualization) {
    if (!visualization) return;

    const type = this.getVisualizationType(visualization);
    if (!type) return;

    if (visualization.points) {
      visualization.points.material = this.materials[type].normal;
    }
    if (visualization.lines) {
      visualization.lines.material = this.materials[type].normal;
      if (visualization.lines.glow) {
        visualization.lines.glow.visible = false;
      }
    }
    if (visualization.surface) {
      visualization.surface.material = this.materials[type].normal;
      if (visualization.surface.wireframe) {
        visualization.surface.wireframe.visible = false;
      }
    }

    // Hide labels unless global labels are enabled
    if (!this.showLabelsGlobal) {
      this.hideLabels(visualization);
    }
  }

  highlightConnection(connection) {
    // Unhighlight previous selection
    this.labels.forEach((_, vis) => this.unhighlight(vis));

    // Get the visualization for this connection
    const visualization = this.connectionVisualizations.get(connection.id);
    if (!visualization) return;

    // Apply highlight effect
    this.highlight(visualization);

    // Show labels
    if (this.showLabelsGlobal) {
      this.showLabels(visualization);
    }

    // Update label positions
    this.updateLabels();
  }

  showLabels(visualization) {
    const label = this.labels.get(visualization);
    if (label && label.element) {
      label.element.style.display = "block";
    }
  }

  hideLabels(visualization) {
    const label = this.labels.get(visualization);
    if (label && label.element) {
      label.element.style.display = "none";
    }
  }

  getVisualizationType(visualization) {
    if (visualization.surface) return "surface";
    if (visualization.lines) return "line";
    if (visualization.points) return "point";
    return null;
  }

  createSurfaceVisualization(intersection) {
    try {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        intersection.points.attributes.position.clone()
      );

      if (geometry.attributes.position.count > 2) {
        geometry.computeVertexNormals();
        return new THREE.Mesh(geometry, this.materials.surface.normal);
      }
      return null;
    } catch (error) {
      console.warn("Failed to create surface visualization:", error);
      return null;
    }
  }

  updateLabels() {
    this.labelRenderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.labelRenderer) {
      document.body.removeChild(this.labelRenderer.domElement);
    }
  }
}

export { FastIntersectionDetector, IntersectionVisualizer };
