import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import * as WebIFC from "web-ifc";
import { IFCBUILDING, IFCBUILDINGSTOREY, IFCPROJECT, IFCSITE } from "web-ifc";
import { IfcAPI } from "web-ifc/web-ifc-api.js";
import {
  FastIntersectionDetector,
  IntersectionVisualizer,
} from "./connection-utils.js";
import { PropertiesPanel } from "./components/PropertiesPanel.js";
import { FloatingMenu } from "./components/FloatingMenu.js";
import { Sidebar } from "./components/Sidebar.js";
import { Picker } from "./components/Picker.js";
import { SpatialTree } from "./components/SpatialTree.js";

class IFCViewer {
  constructor(container) {
    this.container = container;
    this.loadingOverlay = null;
    this.models = new Map();
    this.modelCounter = 0;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.ifcAPI = null;
    this.selectedObject = null;

    // Initialize components
    this.propertiesPanel = new PropertiesPanel();
    this.init();
  }

  showLoading() {
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.add("active");
    }
  }

  hideLoading() {
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.remove("active");
    }
  }

  async init() {
    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.setup());
    } else {
      await this.setup();
    }
  }

  async setup() {
    // Initialize loading overlay
    this.loadingOverlay = document.querySelector(".loading-overlay");

    try {
      this.showLoading();

      // Initialize scene
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0xf0f0f0);

      // Initialize camera
      this.camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      this.camera.position.set(10, 10, 10);
      this.camera.lookAt(0, 0, 0);

      // Initialize renderer
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.renderer.shadowMap.enabled = false;
      this.container.appendChild(this.renderer.domElement);

      // Initialize controls
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;

      // Add grid and axes
      this.grid = new THREE.GridHelper(50, 50);
      this.grid.visible = false;
      this.scene.add(this.grid);

      this.axes = new THREE.AxesHelper(5);
      this.axes.visible = false;
      this.scene.add(this.axes);

      // Add lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      this.scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(5, 10, 5);
      directionalLight.castShadow = true;
      this.scene.add(directionalLight);

      // Initialize IFC API
      this.ifcAPI = new IfcAPI();
      await this.ifcAPI.Init();

      // Initialize components
      this.sidebar = new Sidebar(this);
      this.floatingMenu = new FloatingMenu(this);
      this.propertiesPanel.setupPropertiesPanel();
      this.picker = new Picker(this);
      this.spatialTree = new SpatialTree(this);

      // Setup picking
      this.setupPicking();

      // Setup keyboard shortcuts
      this.setupKeyboardShortcuts();

      // Start animation loop
      this.animate();

      // Handle window resize
      window.addEventListener("resize", () => this.onWindowResize());

      console.log("IFC viewer initialized successfully");
    } catch (error) {
      console.error("Error initializing IFC viewer:", error);
    } finally {
      this.hideLoading();
    }
  }

  setupSettingsPanel() {
    // Grid toggle
    const gridToggle = document.getElementById("grid-toggle");
    gridToggle.addEventListener("change", () => {
      if (this.grid) {
        this.grid.visible = gridToggle.checked;
      }
    });

    // Axes toggle
    const axesToggle = document.getElementById("axes-toggle");
    axesToggle.addEventListener("change", () => {
      if (this.axes) {
        this.axes.visible = axesToggle.checked;
      }
    });

    // Shadows toggle
    const shadowsToggle = document.getElementById("shadows-toggle");
    shadowsToggle.addEventListener("change", () => {
      this.renderer.shadowMap.enabled = shadowsToggle.checked;
      this.models.forEach((model) => {
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = shadowsToggle.checked;
            child.receiveShadow = shadowsToggle.checked;
          }
        });
      });
    });

    // Opacity slider
    const opacitySlider = document.getElementById("opacity-slider");
    opacitySlider.addEventListener("input", () => {
      const opacity = opacitySlider.value / 100;
      this.models.forEach((model) => {
        model.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.opacity = opacity;
            child.material.transparent = opacity < 1;
            child.material.needsUpdate = true;
          }
        });
      });
    });
  }

  setupModelsPanel() {
    // Toggle models panel
    const modelsPanel = document.querySelector(".models-panel");
    const modelsToggle = document.querySelector(".models-toggle");
    modelsToggle.addEventListener("click", () => {
      modelsPanel.classList.toggle("collapsed");
    });
  }

  createModelListItem(modelId, fileName, model) {
    const modelsList = document.getElementById("models-list");
    const modelItem = document.createElement("div");
    modelItem.className = "model-item";
    modelItem.id = `model-${modelId}`;

    const modelHeader = document.createElement("div");
    modelHeader.className = "model-header";

    const modelName = document.createElement("div");
    modelName.className = "model-name";
    modelName.textContent = fileName;

    const modelControls = document.createElement("div");
    modelControls.className = "model-controls";

    // Visibility toggle button
    const visibilityBtn = document.createElement("button");
    visibilityBtn.className = "model-control-btn";
    visibilityBtn.innerHTML = '<i class="fas fa-eye"></i>';
    visibilityBtn.title = "Toggle Visibility";
    visibilityBtn.addEventListener("click", () => {
      model.visible = !model.visible;
      visibilityBtn.innerHTML = model.visible
        ? '<i class="fas fa-eye"></i>'
        : '<i class="fas fa-eye-slash"></i>';
    });

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "model-control-btn";
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.title = "Delete Model";
    deleteBtn.addEventListener("click", async () => {
      this.scene.remove(model);
      this.models.delete(modelId);
      modelItem.remove();
    });

    modelControls.appendChild(visibilityBtn);
    modelControls.appendChild(deleteBtn);
    modelHeader.appendChild(modelName);
    modelHeader.appendChild(modelControls);
    modelItem.appendChild(modelHeader);

    // Model info section
    const modelInfo = document.createElement("div");
    modelInfo.className = "model-info";

    // Get model information
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    modelInfo.innerHTML = `
      <div>Size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(
      2
    )}</div>
      <div>Center: (${center.x.toFixed(2)}, ${center.y.toFixed(
      2
    )}, ${center.z.toFixed(2)})</div>
    `;

    // Add spatial tree section to model card
    const treeSection = document.createElement("div");
    treeSection.className = "model-tree-section";
    const treeContent = document.createElement("div");
    treeContent.className = "model-tree-content";
    treeContent.id = `model-tree-${modelId}`;
    treeSection.appendChild(treeContent);

    modelItem.appendChild(modelInfo);
    modelItem.appendChild(treeSection);
    modelsList.appendChild(modelItem);
  }

  setupPropertiesPanel() {
    // Toggle properties panel
    const propertiesPanel = document.querySelector(".properties-panel");
    const propertiesToggle = document.querySelector(".properties-toggle");
    propertiesToggle.addEventListener("click", () => {
      propertiesPanel.classList.toggle("collapsed");
      // Adjust settings panel position
      const settingsPanel = document.querySelector(".settings-panel");
      if (propertiesPanel.classList.contains("collapsed")) {
        settingsPanel.style.right = "1rem";
      } else {
        settingsPanel.style.right = "calc(300px + 1rem)";
      }
    });
  }

  setupPicking() {
    this.container.addEventListener("click", (event) =>
      this.picker.handleClick(event)
    );
    this.container.addEventListener("mousemove", (event) =>
      this.picker.handleMouseMove(event)
    );
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  async loadIFC(file) {
    try {
      this.showLoading();
      console.log("Starting to load IFC file...");

      // Read the file
      const data = await file.arrayBuffer();
      console.log("File read as ArrayBuffer");

      // Load the model
      const modelID = this.ifcAPI.OpenModel(new Uint8Array(data), {
        COORDINATE_TO_ORIGIN: true,
        USE_FAST_BOOLS: true,
      });
      console.log(`Model opened with ID: ${modelID}`);

      // Create a group for the model
      const model = new THREE.Group();
      model.name = file.name;
      model.modelID = modelID;

      let elementCount = 0;
      let geometryCount = 0;

      // Stream all meshes
      this.ifcAPI.StreamAllMeshes(modelID, (mesh) => {
        const placedGeometries = mesh.geometries;
        const expressID = mesh.expressID;

        // Create a group for this IFC element
        const elementGroup = new THREE.Group();
        elementGroup.modelID = modelID;
        elementGroup.expressID = expressID;
        elementGroup.name = `Element_${expressID}`;

        for (let i = 0; i < placedGeometries.size(); i++) {
          const placedGeometry = placedGeometries.get(i);

          try {
            const geometry = this.getBufferGeometry(modelID, placedGeometry);
            geometryCount++;

            // Apply transformation
            const matrix = new THREE.Matrix4();
            matrix.fromArray(placedGeometry.flatTransformation);
            geometry.applyMatrix4(matrix);

            // Create material
            const color = placedGeometry.color;
            const material = new THREE.MeshPhongMaterial({
              color: new THREE.Color(color.x, color.y, color.z),
              opacity: color.w,
              transparent: color.w !== 1,
              side: THREE.DoubleSide,
            });

            // Create mesh
            const mesh = new THREE.Mesh(geometry, material);
            mesh.modelID = modelID;
            mesh.expressID = expressID;
            mesh.name = `Mesh_${expressID}_${i}`;
            elementGroup.add(mesh);
          } catch (error) {
            console.error(
              `Error processing geometry ${i} for element ${expressID}:`,
              error
            );
          }
        }

        model.add(elementGroup);
        elementCount++;
      });

      console.log(
        `Processed ${elementCount} elements with ${geometryCount} total geometries`
      );

      // Add to scene
      this.scene.add(model);
      const modelId = ++this.modelCounter;
      this.models.set(modelId, model);

      // Create model list item
      this.createModelListItem(modelId, file.name, model);

      // Build spatial tree
      await this.spatialTree.buildSpatialTree(modelID);

      // Focus camera on model
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      console.log("Model bounds:", {
        size: size.toArray(),
        center: center.toArray(),
      });

      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = this.camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 1.5;

      this.camera.position.set(
        center.x + cameraZ * 0.5,
        center.y + cameraZ * 0.5,
        center.z + cameraZ
      );
      this.controls.target.copy(center);
      this.camera.lookAt(center);
      this.controls.update();

      console.log("IFC file loaded successfully");
    } catch (error) {
      console.error("Error loading IFC file:", error);
      console.error("Error details:", error.stack);
    } finally {
      this.hideLoading();
    }
  }

  getBufferGeometry(modelID, placedGeometry) {
    // Get geometry data
    const geometry = this.ifcAPI.GetGeometry(
      modelID,
      placedGeometry.geometryExpressID
    );
    const verts = this.ifcAPI.GetVertexArray(
      geometry.GetVertexData(),
      geometry.GetVertexDataSize()
    );
    const indices = this.ifcAPI.GetIndexArray(
      geometry.GetIndexData(),
      geometry.GetIndexDataSize()
    );

    // Create buffer geometry
    const bufferGeometry = new THREE.BufferGeometry();

    // Split interleaved vertex data into positions and normals
    const posFloats = new Float32Array(verts.length / 2);
    const normFloats = new Float32Array(verts.length / 2);

    for (let i = 0; i < verts.length; i += 6) {
      posFloats[i / 2 + 0] = verts[i + 0];
      posFloats[i / 2 + 1] = verts[i + 1];
      posFloats[i / 2 + 2] = verts[i + 2];

      normFloats[i / 2 + 0] = verts[i + 3];
      normFloats[i / 2 + 1] = verts[i + 4];
      normFloats[i / 2 + 2] = verts[i + 5];
    }

    // Set attributes
    bufferGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(posFloats, 3)
    );
    bufferGeometry.setAttribute(
      "normal",
      new THREE.BufferAttribute(normFloats, 3)
    );
    bufferGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

    // Clean up WASM memory
    geometry.delete();

    return bufferGeometry;
  }

  setupKeyboardShortcuts() {
    document.addEventListener("keydown", (event) => {
      // Space to toggle visibility of selected object
      if (
        event.code === "Space" &&
        this.picker.selectedObject &&
        !event.target.closest("input, textarea")
      ) {
        event.preventDefault();
        this.toggleSelectedVisibility();
      }
    });
  }

  toggleSelectedVisibility() {
    if (!this.picker.selectedObject) return;

    const isVisible = this.picker.selectedObject.visible;
    this.picker.selectedObject.traverse((child) => {
      if (child.isMesh) {
        child.visible = !isVisible;
      }
    });
  }

  isolateSelected() {
    if (!this.picker.selectedObject) return;

    this.models.forEach((model) => {
      model.traverse((child) => {
        if (child.isMesh) {
          child.visible = false;
        }
      });
    });

    this.picker.selectedObject.traverse((child) => {
      if (child.isMesh) {
        child.visible = true;
      }
    });
  }

  showAll() {
    this.models.forEach((model) => {
      model.traverse((child) => {
        if (child.isMesh) {
          child.visible = true;
        }
      });
    });
  }
}

// Initialize the viewer when the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("viewer-container");
  const viewer = new IFCViewer(container);

  // Setup file input handler
  const input = document.getElementById("file-input");
  input.addEventListener(
    "change",
    async (event) => {
      const file = event.target.files[0];
      if (file) {
        await viewer.loadIFC(file);
      }
    },
    false
  );
});
