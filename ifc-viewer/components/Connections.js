import * as THREE from "three";
import {
  FastIntersectionDetector,
  IntersectionVisualizer,
} from "../connection-utils.js";

export class Connections {
  constructor(viewer) {
    this.viewer = viewer;
    this.connectionDetector = null;
    this.connectionVisualizer = null;
    this.elementConnections = new Map();
    this.connections = new Map();
    this.connectionVisualizations = new Map();
    this.isConnectionMode = false;
  }

  async analyzeConnections() {
    if (this.viewer.models.size === 0) {
      alert("Please load an IFC model first");
      return;
    }

    // Show loading state
    this.viewer.showLoading();

    try {
      // Set model elements semi-transparent
      this.viewer.models.forEach((model) => {
        model.traverse((child) => {
          if (child.isMesh) {
            if (!child.originalMaterial) {
              child.originalMaterial = child.material.clone();
            }
            child.material.transparent = true;
            child.material.opacity = 0.3;
            child.material.depthWrite = false;
            child.material.needsUpdate = true;
          }
        });
      });

      // Initialize connection detector if not already done
      if (!this.connectionDetector) {
        this.connectionDetector = new FastIntersectionDetector();
      }

      // Create visualizer if not exists
      if (!this.connectionVisualizer) {
        this.connectionVisualizer = new IntersectionVisualizer(
          this.viewer.scene,
          this.viewer.camera
        );
      }
      this.isConnectionMode = true;
      this.connectionVisualizer.setConnectionMode(true);

      // Process each model
      for (const [modelId, model] of this.viewer.models) {
        // Setup detector for the model
        this.connectionDetector.setupOctree(model);

        // Get all building elements
        const elements = [];
        model.traverse((child) => {
          if (child.name.startsWith("Element_")) {
            elements.push({
              object: child,
              modelID: child.modelID,
              expressID: child.expressID,
            });
          }
        });

        // Find connections between elements
        const connections = new Map();
        for (let i = 0; i < elements.length; i++) {
          for (let j = i + 1; j < elements.length; j++) {
            const intersection = this.connectionDetector.findIntersection(
              elements[i].object,
              elements[j].object
            );

            if (intersection) {
              const connectionId = `${elements[i].expressID}-${elements[j].expressID}`;
              const connection = {
                id: connectionId,
                elements: [elements[i], elements[j]],
                type: intersection.type,
                measurements: intersection.measurements,
                visualization: intersection,
              };
              connections.set(connectionId, connection);

              // Track elements with connections
              elements[i].object.userData.hasConnections = true;
              elements[j].object.userData.hasConnections = true;

              // Store connection references for each element
              if (!this.elementConnections.has(elements[i].expressID)) {
                this.elementConnections.set(elements[i].expressID, new Set());
              }
              if (!this.elementConnections.has(elements[j].expressID)) {
                this.elementConnections.set(elements[j].expressID, new Set());
              }
              this.elementConnections
                .get(elements[i].expressID)
                .add(connectionId);
              this.elementConnections
                .get(elements[j].expressID)
                .add(connectionId);
            }
          }
        }

        // Store connections
        this.connections.set(modelId, connections);

        // Visualize connections
        this.visualizeConnections(modelId, connections);

        // Update UI
        this.updateConnectionsPanel(modelId, connections);
      }
    } catch (error) {
      console.error("Error analyzing connections:", error);
      alert("An error occurred while analyzing connections");
    } finally {
      this.viewer.hideLoading();
    }
  }

  exitConnectionMode() {
    this.isConnectionMode = false;

    // Restore original materials
    this.viewer.models.forEach((model) => {
      model.traverse((child) => {
        if (child.isMesh && child.originalMaterial) {
          child.material = child.originalMaterial;
          delete child.originalMaterial;
        }
      });
    });

    // Clear visualizations and disable connection mode
    if (this.connectionVisualizer) {
      this.connectionVisualizer.setConnectionMode(false);
      this.connectionVisualizations.forEach((vis) => {
        if (vis.points) this.viewer.scene.remove(vis.points);
        if (vis.lines) this.viewer.scene.remove(vis.lines);
        if (vis.surface) this.viewer.scene.remove(vis.surface);
      });
      this.connectionVisualizations.clear();
    }

    // Hide connections panel
    const connectionsSection = document.querySelector(".connections-section");
    if (connectionsSection) {
      connectionsSection.classList.add("hidden");
    }
  }

  visualizeConnections(modelId, connections) {
    // Clear existing visualizations
    if (this.connectionVisualizations) {
      this.connectionVisualizations.forEach((vis) => {
        if (vis.points) this.viewer.scene.remove(vis.points);
        if (vis.lines) this.viewer.scene.remove(vis.lines);
        if (vis.surface) this.viewer.scene.remove(vis.surface);
      });
    }
    this.connectionVisualizations = new Map();

    // Create visualizer if not exists
    if (!this.connectionVisualizer) {
      this.connectionVisualizer = new IntersectionVisualizer(
        this.viewer.scene,
        this.viewer.camera
      );
    }

    // Visualize each connection
    connections.forEach((connection) => {
      const visualization = this.connectionVisualizer.visualize(
        connection.visualization
      );
      this.connectionVisualizations.set(connection.id, visualization);
    });
  }

  updateConnectionsPanel(modelId, connections) {
    const connectionsList = document.querySelector(".connections-list");
    if (!connectionsList) return;

    connectionsList.innerHTML = "";

    // Create connection type groups
    const connectionsByType = {
      point: [],
      line: [],
      surface: [],
    };

    connections.forEach((connection) => {
      connectionsByType[connection.type].push(connection);
    });

    // Create summary section
    const summarySection = document.createElement("div");
    summarySection.className = "connections-summary";
    summarySection.innerHTML = `
      <div class="summary-item">
        <span class="summary-icon" style="color: #ff3366"><i class="fas fa-circle"></i></span>
        <span class="summary-count">${connectionsByType.point.length}</span>
        <span class="summary-label">Point Connections</span>
      </div>
      <div class="summary-item">
        <span class="summary-icon" style="color: #33ff66"><i class="fas fa-minus"></i></span>
        <span class="summary-count">${connectionsByType.line.length}</span>
        <span class="summary-label">Line Connections</span>
      </div>
      <div class="summary-item">
        <span class="summary-icon" style="color: #3366ff"><i class="fas fa-square"></i></span>
        <span class="summary-count">${connectionsByType.surface.length}</span>
        <span class="summary-label">Surface Connections</span>
      </div>
    `;
    connectionsList.appendChild(summarySection);

    // Create type sections
    Object.entries(connectionsByType).forEach(([type, typeConnections]) => {
      if (typeConnections.length === 0) return;

      const typeSection = document.createElement("div");
      typeSection.className = "connection-type-section";

      const typeHeader = document.createElement("div");
      typeHeader.className = "type-header";
      typeHeader.innerHTML = `
        <div class="type-title">
          <span class="type-icon" style="color: ${
            this.connectionVisualizer.colors[type]
          }">
            <i class="fas fa-${
              type === "point" ? "circle" : type === "line" ? "minus" : "square"
            }"></i>
          </span>
          <span>${
            type.charAt(0).toUpperCase() + type.slice(1)
          } Connections</span>
        </div>
        <button class="type-toggle">
          <i class="fas fa-chevron-down"></i>
        </button>
      `;
      typeSection.appendChild(typeHeader);

      const typeContent = document.createElement("div");
      typeContent.className = "type-content";

      typeConnections.forEach((connection) => {
        const item = document.createElement("div");
        item.className = "connection-item";
        item.dataset.connectionId = connection.id;

        const measurements = connection.measurements;
        const measurementText =
          type === "surface"
            ? `Area: ${measurements.area.toFixed(2)} m²`
            : `Length: ${measurements.length.toFixed(2)} m`;

        item.innerHTML = `
          <div class="connection-header">
            <div class="connection-info">
              <div class="connection-elements">
                <span>Elements ${connection.elements[0].expressID} ↔ ${connection.elements[1].expressID}</span>
              </div>
              <div class="connection-measurement">${measurementText}</div>
            </div>
          </div>
        `;

        // Add click handler for the item
        item.addEventListener("click", () => {
          // Remove previous selection
          connectionsList
            .querySelectorAll(".connection-item")
            .forEach((i) => i.classList.remove("selected"));
          item.classList.add("selected");

          this.zoomToConnection(connection);
        });

        typeContent.appendChild(item);
      });

      typeSection.appendChild(typeContent);
      connectionsList.appendChild(typeSection);

      // Add type section toggle
      typeHeader.addEventListener("click", () => {
        typeSection.classList.toggle("collapsed");
        const icon = typeHeader.querySelector("i");
        icon.classList.toggle("fa-chevron-down");
        icon.classList.toggle("fa-chevron-right");
      });
    });
  }

  zoomToConnection(connection) {
    // Create bounding box encompassing all connected elements and visualization
    const bbox = new THREE.Box3();

    // Add connected elements to bbox
    connection.elements.forEach((element) => {
      const elementBox = new THREE.Box3().setFromObject(element.object);
      bbox.union(elementBox);
    });

    // Add visualization to bbox
    const visualization = this.connectionVisualizations.get(connection.id);
    if (visualization) {
      if (visualization.points) bbox.expandByObject(visualization.points);
      if (visualization.lines) bbox.expandByObject(visualization.lines);
      if (visualization.surface) bbox.expandByObject(visualization.surface);

      // Highlight the connection
      this.connectionVisualizer.highlight(visualization);
      if (this.connectionVisualizer.showLabelsGlobal) {
        this.connectionVisualizer.showLabels(visualization);
        this.connectionVisualizer.updateLabels();
      }
    }

    // Get bbox center and size
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bbox.getCenter(center);
    bbox.getSize(size);

    // Calculate camera position
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.viewer.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.5; // Add some padding

    // Animate camera movement
    const currentPosition = this.viewer.camera.position.clone();
    const currentTarget = this.viewer.controls.target.clone();
    const newPosition = new THREE.Vector3(
      center.x + cameraZ * 0.5,
      center.y + cameraZ * 0.5,
      center.z + cameraZ
    );

    this.animateCamera(
      currentPosition,
      newPosition,
      currentTarget,
      center,
      1000
    );
  }

  animateCamera(startPos, endPos, startTarget, endTarget, duration) {
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease function (cubic)
      const ease =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      // Update camera position
      this.viewer.camera.position.lerpVectors(startPos, endPos, ease);

      // Update controls target
      this.viewer.controls.target.lerpVectors(startTarget, endTarget, ease);
      this.viewer.controls.update();

      // Continue animation if not complete
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }
}
