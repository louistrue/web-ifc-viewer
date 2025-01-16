import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { IfcAPI } from "web-ifc/web-ifc-api";
import { mergeBufferGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as WebIFC from "web-ifc";

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

    modelItem.appendChild(modelInfo);
    modelsList.appendChild(modelItem);
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

    // Setup panels
    this.setupSettingsPanel();
    this.setupModelsPanel();
    this.setupPropertiesPanel();

      // Setup picking
      this.setupPicking();

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
    this.selectedMaterial = new THREE.MeshPhongMaterial({
      color: 0xff9800,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });

    this.prePick = {
      material: new THREE.MeshPhongMaterial({
        color: 0x2196f3,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      }),
      object: null,
    };

    this.container.addEventListener("click", (event) =>
      this.handleClick(event)
    );
    this.container.addEventListener("mousemove", (event) =>
      this.handleMouseMove(event)
    );
  }

  handleMouseMove(event) {
    const result = this.pick(event);

    // Reset previous pre-pick state
    if (this.prePick.object) {
      this.prePick.object.traverse((child) => {
        if (child.isMesh && child.originalMaterial) {
          child.material = child.originalMaterial;
          delete child.originalMaterial;
        }
      });
      this.prePick.object = null;
    }

    if (result) {
      const { object } = result;
      // Store original materials and apply pre-pick material
      object.traverse((child) => {
        if (child.isMesh) {
          child.originalMaterial = child.material;
          child.material = this.prePick.material;
        }
      });
      this.prePick.object = object;
      this.container.style.cursor = "pointer";
    } else {
      this.container.style.cursor = "default";
    }
  }

  async handleClick(event) {
    const result = this.pick(event);

    // Reset previous selection
    this.models.forEach((model) => {
      model.traverse((child) => {
        if (child.isMesh && child.originalMaterial) {
          child.material = child.originalMaterial;
          delete child.originalMaterial;
        }
      });
    });

    if (result) {
      const { object, modelID, expressID } = result;

      try {
        // Get basic properties with error handling
        let props;
        try {
          props = await this.ifcAPI.GetLine(modelID, expressID, true);
          console.log("Element properties:", props);
        } catch (error) {
          console.warn("Error getting basic properties:", error);
          props = {};
        }

        // Get schema version
        const schema = this.ifcAPI.GetModelSchema(modelID);
        console.log("IFC Schema:", schema);

        // Get property sets using the official approach
        const psets = [];
        try {
          const lines = await this.ifcAPI.GetLineIDsWithType(
            modelID,
            WebIFC.IFCRELDEFINESBYPROPERTIES
          );
          console.log(`Found ${lines.size()} property set relationships`);

          for (let i = 0; i < lines.size(); i++) {
            const relID = lines.get(i);
            const rel = await this.ifcAPI.GetLine(modelID, relID);

            if (!rel || !rel.RelatedObjects) continue;

            // Check if this relationship references our element
            let foundElement = false;
            const relatedObjects = Array.isArray(rel.RelatedObjects)
              ? rel.RelatedObjects
              : [rel.RelatedObjects];

            for (const relID of relatedObjects) {
              if (
                relID &&
                typeof relID.value !== "undefined" &&
                relID.value === expressID
              ) {
                foundElement = true;
                break;
              }
            }

            if (foundElement && rel.RelatingPropertyDefinition) {
              try {
                const propertySet = await this.ifcAPI.GetLine(
                  modelID,
                  rel.RelatingPropertyDefinition.value,
                  true
                );
                if (propertySet && propertySet.HasProperties) {
                  psets.push(propertySet);
                }
    } catch (error) {
                console.warn("Error getting property set:", error);
              }
            }
          }
        } catch (error) {
          console.warn("Error getting property sets:", error);
        }

        // Get material properties
        const materials = [];
        try {
          const materialLines = await this.ifcAPI.GetLineIDsWithType(
            modelID,
            WebIFC.IFCRELASSOCIATESMATERIAL
          );

          for (let i = 0; i < materialLines.size(); i++) {
            const relID = materialLines.get(i);
            const rel = await this.ifcAPI.GetLine(modelID, relID);

            if (!rel || !rel.RelatedObjects) continue;

            let foundElement = false;
            const relatedObjects = Array.isArray(rel.RelatedObjects)
              ? rel.RelatedObjects
              : [rel.RelatedObjects];

            for (const relID of relatedObjects) {
              if (
                relID &&
                typeof relID.value !== "undefined" &&
                relID.value === expressID
              ) {
                foundElement = true;
                break;
              }
            }

            if (foundElement && rel.RelatingMaterial) {
              try {
                const material = await this.ifcAPI.GetLine(
                  modelID,
                  rel.RelatingMaterial.value,
                  true
                );
                if (material) {
                  materials.push(material);
                }
              } catch (error) {
                console.warn("Error getting material:", error);
              }
            }
          }
        } catch (error) {
          console.warn("Error getting materials:", error);
        }

        // Get type properties
        const typeProps = [];
        if (props && props.IsTypedBy) {
          try {
            const typeRel = await this.ifcAPI.GetLine(
              modelID,
              props.IsTypedBy.value,
      true
    );
            if (typeRel && typeRel.RelatingType) {
              const type = await this.ifcAPI.GetLine(
                modelID,
                typeRel.RelatingType.value,
                true
              );
              if (type) {
                typeProps.push(type);
              }
            }
          } catch (error) {
            console.warn("Error getting type properties:", error);
          }
        }

        // Get spatial structure
        const spatialInfo = [];
        if (props && props.ContainedInStructure) {
          try {
            const containedRels = Array.isArray(props.ContainedInStructure)
              ? props.ContainedInStructure
              : [props.ContainedInStructure];

            for (const rel of containedRels) {
              if (rel && rel.value) {
                const spatial = await this.ifcAPI.GetLine(
                  modelID,
                  rel.value,
                  true
                );
                if (spatial && spatial.RelatingStructure) {
                  const structure = await this.ifcAPI.GetLine(
                    modelID,
                    spatial.RelatingStructure.value,
                    true
                  );
                  if (structure) {
                    spatialInfo.push(structure);
                  }
                }
              }
            }
          } catch (error) {
            console.warn("Error getting spatial info:", error);
          }
        }

        console.log("Property sets:", psets);
        console.log("Materials:", materials);
        console.log("Type properties:", typeProps);
        console.log("Spatial info:", spatialInfo);

        // Display all properties
        this.displayElementProperties(
          props.__proto__?.constructor?.name || "Unknown",
          props,
          psets,
          typeProps,
          materials,
          [], // classifications (not implemented)
          spatialInfo
        );

        // Highlight selected object
        object.traverse((child) => {
          if (child.isMesh) {
            child.originalMaterial = child.material;
            child.material = this.selectedMaterial;
          }
        });

        // Show properties panel
        document.querySelector(".no-selection").style.display = "none";
        document.querySelector(".element-info").style.display = "block";
        document
          .querySelector(".properties-panel")
          .classList.remove("collapsed");
      } catch (error) {
        console.error("Error getting element properties:", error);
        console.error("Error details:", error.stack);
      }
    } else {
      // Clear selection
      document.querySelector(".no-selection").style.display = "block";
      document.querySelector(".element-info").style.display = "none";
    }
  }

  pick(event) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x =
      ((event.clientX - rect.left) / this.container.clientWidth) * 2 - 1;
    this.mouse.y =
      -((event.clientY - rect.top) / this.container.clientHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(
      Array.from(this.models.values()),
      true
    );

    if (intersects.length > 0) {
      const intersect = intersects[0];
      const object = intersect.object;

      // Find the element group (parent with both modelID and expressID)
      let elementGroup = object;
      while (elementGroup && elementGroup.type !== "Scene") {
        if (
          elementGroup.name.startsWith("Element_") &&
          elementGroup.modelID !== undefined &&
          elementGroup.expressID !== undefined
        ) {
          return {
            object: elementGroup,
            modelID: elementGroup.modelID,
            expressID: elementGroup.expressID,
          };
        }
        elementGroup = elementGroup.parent;
      }

      console.log("No element group found in hierarchy");
    }

    return null;
  }

  displayElementProperties(
    type,
    properties,
    psets,
    typeProps,
    materials,
    classifications,
    spatialInfo
  ) {
    const attributesList = document.getElementById("element-attributes");
    const propertiesList = document.getElementById("element-properties");

    // Clear previous content
    attributesList.innerHTML = "";
    propertiesList.innerHTML = "";

    // Display IFC type
    this.addPropertyItem(attributesList, "IFC Type", type.replace("IFC", ""));

    // Display direct properties
    if (properties) {
      const basicProps = [
        "expressID",
        "GlobalId",
        "Name",
        "ObjectType",
        "Tag",
        "Description",
        "PredefinedType",
      ];
      basicProps.forEach((key) => {
        if (properties[key]) {
          const value =
            properties[key].value !== undefined
              ? properties[key].value
              : properties[key];
          this.addPropertyItem(attributesList, key, value);
        }
      });
    }

    // Display property sets
    if (psets && psets.length > 0) {
      const psetContainer = document.createElement("div");
      psetContainer.className = "property-group";
      psetContainer.innerHTML = "<h4>Property Sets</h4>";
      this.displayPropertyGroup(psetContainer, psets);
      propertiesList.appendChild(psetContainer);
    }

    // Display type properties
    if (typeProps && typeProps.length > 0) {
      const typeContainer = document.createElement("div");
      typeContainer.className = "property-group";
      typeContainer.innerHTML = "<h4>Type Properties</h4>";
      typeProps.forEach((typeProp) => {
        const typeHeader = document.createElement("h5");
        typeHeader.textContent = typeProp.Name?.value || "Type Information";
        typeContainer.appendChild(typeHeader);

        Object.entries(typeProp).forEach(([key, value]) => {
          if (!key.startsWith("_") && value !== null && value !== undefined) {
            this.addPropertyItem(typeContainer, key, value.value || value);
          }
        });
      });
      propertiesList.appendChild(typeContainer);
    }

    // Display material properties
    if (materials && materials.length > 0) {
      const materialContainer = document.createElement("div");
      materialContainer.className = "property-group";
      materialContainer.innerHTML = "<h4>Material Properties</h4>";

      materials.forEach((material) => {
        const materialHeader = document.createElement("h5");
        materialHeader.textContent = material.Name?.value || "Material";
        materialContainer.appendChild(materialHeader);

        // Handle Material Layer Set
        if (material.ForLayerSet) {
          const layerSet = material.ForLayerSet;

          // Add layer set properties
          if (layerSet.LayerSetName) {
            this.addPropertyItem(
              materialContainer,
              "Layer Set Name",
              layerSet.LayerSetName.value
            );
          }
          if (layerSet.Description) {
            this.addPropertyItem(
              materialContainer,
              "Description",
              layerSet.Description.value
            );
          }
          if (material.LayerSetDirection) {
            this.addPropertyItem(
              materialContainer,
              "Layer Set Direction",
              material.LayerSetDirection
            );
          }
          if (material.DirectionSense) {
            this.addPropertyItem(
              materialContainer,
              "Direction Sense",
              material.DirectionSense
            );
          }
          if (material.OffsetFromReferenceLine) {
            this.addPropertyItem(
              materialContainer,
              "Offset From Reference Line",
              material.OffsetFromReferenceLine
            );
          }

          // Display layers
          if (layerSet.MaterialLayers) {
            const layers = Array.isArray(layerSet.MaterialLayers)
              ? layerSet.MaterialLayers
              : [layerSet.MaterialLayers];

            const layersDiv = document.createElement("div");
            layersDiv.className = "material-layers";

            layers.forEach((layer, index) => {
              const layerDiv = document.createElement("div");
              layerDiv.className = "material-layer";

              const layerHeader = document.createElement("h6");
              layerHeader.textContent = `Layer ${index + 1}: ${
                layer.Name?.value || ""
              }`;
              layerDiv.appendChild(layerHeader);

              // Layer properties
              if (layer.Material?.Name) {
                this.addPropertyItem(
                  layerDiv,
                  "Material",
                  layer.Material.Name.value
                );
              }
              if (layer.LayerThickness) {
                this.addPropertyItem(
                  layerDiv,
                  "Thickness",
                  `${(layer.LayerThickness.value * 1000).toFixed(0)} mm`
                );
              }
              if (layer.IsVentilated !== null) {
                this.addPropertyItem(
                  layerDiv,
                  "Is Ventilated",
                  layer.IsVentilated
                );
              }
              if (layer.Category) {
                this.addPropertyItem(
                  layerDiv,
                  "Category",
                  layer.Category.value
                );
              }
              if (layer.Priority !== null) {
                this.addPropertyItem(layerDiv, "Priority", layer.Priority);
              }

              layersDiv.appendChild(layerDiv);
            });

            // Calculate and display total thickness
            const totalThickness = layers.reduce((sum, layer) => {
              return sum + (layer.LayerThickness?.value || 0);
            }, 0);
            this.addPropertyItem(
              materialContainer,
              "Total Thickness",
              `${(totalThickness * 1000).toFixed(0)} mm`
            );

            materialContainer.appendChild(layersDiv);
          }
        } else if (material.MaterialConstituents) {
          // Handle Material Constituents (existing code)
          const constituents = Array.isArray(material.MaterialConstituents)
            ? material.MaterialConstituents
            : [material.MaterialConstituents];

          constituents.forEach((constituent, index) => {
            const constituentDiv = document.createElement("div");
            constituentDiv.className = "material-constituent";

            const constituentHeader = document.createElement("h6");
            constituentHeader.textContent = `Layer ${index + 1}: ${
              constituent.Name?.value || ""
            }`;
            constituentDiv.appendChild(constituentHeader);

            if (constituent.Material) {
              const material = constituent.Material;
              if (material.Name) {
                this.addPropertyItem(
                  constituentDiv,
                  "Material",
                  material.Name.value
                );
              }
              if (material.Category) {
                this.addPropertyItem(
                  constituentDiv,
                  "Category",
                  material.Category.value
                );
              }
              if (constituent.Fraction) {
                this.addPropertyItem(
                  constituentDiv,
                  "Fraction",
                  constituent.Fraction
                );
              }
              if (constituent.Category) {
                this.addPropertyItem(
                  constituentDiv,
                  "Layer Category",
                  constituent.Category.value
                );
              }
            }

            materialContainer.appendChild(constituentDiv);
          });
        } else {
          // Handle regular material properties
          Object.entries(material).forEach(([key, value]) => {
            if (!key.startsWith("_") && value !== null && value !== undefined) {
              this.addPropertyItem(
                materialContainer,
                key,
                value.value || value
              );
            }
          });
        }
      });
      propertiesList.appendChild(materialContainer);
    }

    // Display classifications
    if (classifications && classifications.length > 0) {
      const classContainer = document.createElement("div");
      classContainer.className = "property-group";
      classContainer.innerHTML = "<h4>Classifications</h4>";
      classifications.forEach((classification) => {
        const classHeader = document.createElement("h5");
        classHeader.textContent =
          classification.Name?.value || "Classification";
        classContainer.appendChild(classHeader);

        Object.entries(classification).forEach(([key, value]) => {
          if (!key.startsWith("_") && value !== null && value !== undefined) {
            this.addPropertyItem(classContainer, key, value.value || value);
          }
        });
      });
      propertiesList.appendChild(classContainer);
    }

    // Display spatial information
    if (spatialInfo && spatialInfo.length > 0) {
      const spatialContainer = document.createElement("div");
      spatialContainer.className = "property-group";
      spatialContainer.innerHTML = "<h4>Spatial Structure</h4>";
      spatialInfo.forEach((spatial) => {
        const spatialHeader = document.createElement("h5");
        spatialHeader.textContent = spatial.Name?.value || "Location";
        spatialContainer.appendChild(spatialHeader);

        Object.entries(spatial).forEach(([key, value]) => {
          if (!key.startsWith("_") && value !== null && value !== undefined) {
            this.addPropertyItem(spatialContainer, key, value.value || value);
          }
        });
      });
      propertiesList.appendChild(spatialContainer);
    }
  }

  displayPropertyGroup(container, properties) {
    const list = document.createElement("div");
    list.className = "property-list";

          properties.forEach((prop) => {
      if (!prop) return;

      // Handle property set name
      if (prop.Name && prop.Name.value) {
        const groupName = document.createElement("h5");
        groupName.textContent = prop.Name.value;
        list.appendChild(groupName);
      }

      // Handle HasProperties array
      if (prop.HasProperties) {
        const propArray = Array.isArray(prop.HasProperties)
          ? prop.HasProperties
          : [prop.HasProperties];

        propArray.forEach((p) => {
          if (!p || !p.Name) return;

          const name = p.Name.value;
          let value;

          // Handle different property value types
          if (p.NominalValue) {
            if (typeof p.NominalValue === "object") {
              if (p.NominalValue.value !== undefined) {
                value = p.NominalValue.value;
              } else {
                // Try to get the first non-internal property
                const values = Object.entries(p.NominalValue)
                  .filter(([key]) => !key.startsWith("_"))
                  .map(([_, val]) => val);
                value = values[0];
              }
            } else {
              value = p.NominalValue;
            }
          } else if (p.Value) {
            value = p.Value.value;
          } else if (p.EnumValues) {
            value = p.EnumValues.map((v) => v.value).join(", ");
          } else if (p.ListValues) {
            value = p.ListValues.map((v) => v.value).join(", ");
          } else if (p.Unit) {
            value = `${p.Value?.value || ""} ${p.Unit.value || ""}`;
            }

            if (name && value !== undefined) {
            this.addPropertyItem(list, name, value);
          }
        });
      }

      // Handle direct properties (for non-standard property sets)
      Object.entries(prop).forEach(([key, value]) => {
        if (key !== "Name" && key !== "HasProperties" && !key.startsWith("_")) {
          if (typeof value === "object" && value !== null) {
            if (value.value !== undefined) {
              this.addPropertyItem(list, key, value.value);
            } else if (value.Name && value.Name.value) {
              this.addPropertyItem(list, key, value.Name.value);
            }
          } else if (value !== null && value !== undefined) {
            this.addPropertyItem(list, key, value);
          }
        }
      });
    });

    container.appendChild(list);
  }

  addPropertyItem(container, name, value) {
    if (value === undefined || value === null) return;

    // Format the value
    let displayValue = value;
    if (typeof value === "number") {
      // Format numbers with appropriate precision
      displayValue = Number.isInteger(value) ? value : value.toFixed(2);
    } else if (Array.isArray(value)) {
      displayValue = value.join(", ");
    } else if (typeof value === "object") {
      if (value.value !== undefined) {
        displayValue = value.value;
      } else if (value.Name && value.Name.value) {
        displayValue = value.Name.value;
      } else {
        try {
          displayValue = JSON.stringify(value);
        } catch {
          displayValue = "[Complex Value]";
        }
      }
    }

    const item = document.createElement("div");
    item.className = "property-item";
    item.innerHTML = `
      <div class="property-name">${name}</div>
      <div class="property-value">${displayValue}</div>
    `;
    container.appendChild(item);
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
    console.log(
      `Getting geometry for expressID: ${placedGeometry.geometryExpressID}`
    );

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
