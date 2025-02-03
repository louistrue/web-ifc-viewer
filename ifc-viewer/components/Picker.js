import * as THREE from "three";
import { IFCRELDEFINESBYPROPERTIES, IFCRELASSOCIATESMATERIAL } from "web-ifc";

export class Picker {
  constructor(viewer) {
    this.viewer = viewer;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedObject = null;
    this.selectedMaterial = new THREE.MeshPhongMaterial({
      color: 0xff9800,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    this.setupPicking();
  }

  setupPicking() {
    this.prePick = {
      material: new THREE.MeshPhongMaterial({
        color: 0x2196f3,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      }),
      object: null,
    };

    this.viewer.container.addEventListener("click", (event) =>
      this.handleClick(event)
    );
    this.viewer.container.addEventListener("mousemove", (event) =>
      this.handleMouseMove(event)
    );
  }

  handleMouseMove(event) {
    const result = this.pick(event);

    // Reset previous pre-pick state if it's not the selected object
    if (this.prePick.object && this.prePick.object !== this.selectedObject) {
      this.resetHighlight(this.prePick.object);
      this.prePick.object = null;
    }

    // Handle connection hover
    if (
      this.viewer.floatingMenu.connections.isConnectionMode &&
      this.viewer.floatingMenu.connections.connectionVisualizer
    ) {
      // Check if we're hovering over an element with connections
      if (result && result.object.userData.hasConnections) {
        const elementId = result.expressID;
        const connectionIds =
          this.viewer.floatingMenu.connections.elementConnections.get(
            elementId
          );

        if (connectionIds) {
          // Show all connections for this element
          connectionIds.forEach((connectionId) => {
            const modelConnections = Array.from(
              this.viewer.floatingMenu.connections.connections.values()
            )[0];
            const connection = modelConnections.get(connectionId);
            if (connection) {
              const visualization =
                this.viewer.floatingMenu.connections.connectionVisualizations.get(
                  connectionId
                );
              this.viewer.floatingMenu.connections.connectionVisualizer.handleHover(
                {
                  object: { userData: { isConnection: true, visualization } },
                }
              );
            }
          });
        }
        this.viewer.container.style.cursor = "pointer";
      } else {
        // Hide all connection labels if not hovering over an element with connections
        this.viewer.floatingMenu.connections.connectionVisualizer.handleHover(
          null
        );
        this.viewer.container.style.cursor = "default";
      }
    }

    // Regular hover highlighting
    if (result && result.object !== this.selectedObject) {
      const { object } = result;
      object.traverse((child) => {
        if (child.isMesh && !child.isSelected) {
          child.originalMaterial = child.material;
          child.material = this.prePick.material;
        }
      });
      this.prePick.object = object;
      this.viewer.container.style.cursor = "pointer";
    } else if (!result || result.object === this.selectedObject) {
      this.viewer.container.style.cursor = "default";
    }
  }

  async handleClick(event) {
    const result = this.pick(event);

    // Reset previous selection
    if (this.selectedObject) {
      this.resetHighlight(this.selectedObject);
      this.selectedObject = null;
    }

    // Clear pre-pick state if it exists
    if (this.prePick.object) {
      this.resetHighlight(this.prePick.object);
      this.prePick.object = null;
    }

    if (result) {
      const { object, modelID, expressID } = result;
      this.selectedObject = object;

      try {
        // Get basic properties with error handling
        let props;
        try {
          props = await this.viewer.ifcAPI.GetLine(modelID, expressID, true);
          console.log("Element properties:", props);
        } catch (error) {
          console.warn("Error getting basic properties:", error);
          props = {};
        }

        // Get schema version
        const schema = this.viewer.ifcAPI.GetModelSchema(modelID);
        console.log("IFC Schema:", schema);

        // Get property sets using the official approach
        const psets = await this.getPropertySets(modelID, expressID);
        console.log("Property sets:", psets);

        // Get material properties
        const materials = await this.getMaterialProperties(modelID, expressID);
        console.log("Materials:", materials);

        // Get type properties
        const typeProps = await this.getTypeProperties(modelID, props);
        console.log("Type properties:", typeProps);

        // Get spatial structure
        const spatialInfo = await this.getSpatialStructure(modelID, props);
        console.log("Spatial info:", spatialInfo);

        // Get quantity sets
        const quantities = await this.getQuantitySets(modelID, expressID);
        console.log("Quantity sets:", quantities);

        // Display all properties
        this.viewer.propertiesPanel.displayElementProperties(
          props.__proto__?.constructor?.name || "Unknown",
          props,
          psets,
          typeProps,
          materials,
          [], // classifications (not implemented)
          spatialInfo,
          quantities
        );

        // Highlight selected object
        this.highlightElement(modelID, expressID);

        // Show properties panel
        document.querySelector(".no-selection").style.display = "none";
        document.querySelector(".element-info").style.display = "block";
        document
          .querySelector(".properties-panel")
          .classList.remove("collapsed");

        // Add visibility toggle button to header
        this.addVisibilityToggleToHeader(object);
      } catch (error) {
        console.error("Error getting element properties:", error);
        console.error("Error details:", error.stack);
      }
    } else {
      // Clear selection
      document.querySelector(".no-selection").style.display = "block";
      document.querySelector(".element-info").style.display = "none";
      document.querySelector(".properties-panel").classList.add("collapsed");
    }
  }

  async getPropertySets(modelID, expressID) {
    const psets = [];
    try {
      const lines = await this.viewer.ifcAPI.GetLineIDsWithType(
        modelID,
        IFCRELDEFINESBYPROPERTIES
      );
      console.log(`Found ${lines.size()} property set relationships`);

      for (let i = 0; i < lines.size(); i++) {
        const relID = lines.get(i);
        const rel = await this.viewer.ifcAPI.GetLine(modelID, relID);

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
            const propertySet = await this.viewer.ifcAPI.GetLine(
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
    return psets;
  }

  async getMaterialProperties(modelID, expressID) {
    const materials = [];
    try {
      const materialLines = await this.viewer.ifcAPI.GetLineIDsWithType(
        modelID,
        IFCRELASSOCIATESMATERIAL
      );

      for (let i = 0; i < materialLines.size(); i++) {
        const relID = materialLines.get(i);
        const rel = await this.viewer.ifcAPI.GetLine(modelID, relID);

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
            const material = await this.viewer.ifcAPI.GetLine(
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
    return materials;
  }

  async getTypeProperties(modelID, props) {
    const typeProps = [];
    if (props && props.IsTypedBy) {
      try {
        const typeRel = await this.viewer.ifcAPI.GetLine(
          modelID,
          props.IsTypedBy.value,
          true
        );
        if (typeRel && typeRel.RelatingType) {
          const type = await this.viewer.ifcAPI.GetLine(
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
    return typeProps;
  }

  async getSpatialStructure(modelID, props) {
    const spatialInfo = [];
    if (props && props.ContainedInStructure) {
      try {
        const containedRels = Array.isArray(props.ContainedInStructure)
          ? props.ContainedInStructure
          : [props.ContainedInStructure];

        for (const rel of containedRels) {
          if (rel && rel.value) {
            const spatial = await this.viewer.ifcAPI.GetLine(
              modelID,
              rel.value,
              true
            );
            if (spatial && spatial.RelatingStructure) {
              const structure = await this.viewer.ifcAPI.GetLine(
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
    return spatialInfo;
  }

  async getQuantitySets(modelID, expressID) {
    const quantities = [];
    try {
      const quantityLines = await this.viewer.ifcAPI.GetLineIDsWithType(
        modelID,
        IFCRELDEFINESBYPROPERTIES
      );

      for (let i = 0; i < quantityLines.size(); i++) {
        const relID = quantityLines.get(i);
        const rel = await this.viewer.ifcAPI.GetLine(modelID, relID);

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
            const quantitySet = await this.viewer.ifcAPI.GetLine(
              modelID,
              rel.RelatingPropertyDefinition.value,
              true
            );
            // Check if it's a quantity set (has Quantities property)
            if (quantitySet && quantitySet.Quantities) {
              quantities.push(quantitySet);
            }
          } catch (error) {
            console.warn("Error getting quantity set:", error);
          }
        }
      }
    } catch (error) {
      console.warn("Error getting quantity sets:", error);
    }
    return quantities;
  }

  addVisibilityToggleToHeader(object) {
    const elementHeader = document.querySelector(".element-info");
    const headerControls =
      elementHeader.querySelector(".element-controls") ||
      document.createElement("div");
    headerControls.className = "element-controls";
    headerControls.innerHTML = `
      <button class="visibility-toggle" title="Toggle Visibility">
        <i class="fas fa-eye"></i>
      </button>
    `;

    // Add click handler for visibility toggle
    const visibilityBtn = headerControls.querySelector(".visibility-toggle");
    visibilityBtn.addEventListener("click", () => {
      const isVisible = object.visible;
      object.visible = !isVisible;
      visibilityBtn.innerHTML = isVisible
        ? '<i class="fas fa-eye-slash"></i>'
        : '<i class="fas fa-eye"></i>';

      // Update tree view visibility
      const treeItem = document.querySelector(
        `.tree-item-header[data-model-id="${object.modelID}"][data-express-id="${object.expressID}"]`
      );
      if (treeItem) {
        const treeVisibilityBtn = treeItem.querySelector(
          ".tree-item-visibility"
        );
        if (treeVisibilityBtn) {
          treeVisibilityBtn.innerHTML = isVisible
            ? '<i class="fas fa-eye-slash"></i>'
            : '<i class="fas fa-eye"></i>';
        }
      }
    });

    if (!elementHeader.querySelector(".element-controls")) {
      elementHeader.insertBefore(headerControls, elementHeader.firstChild);
    }
  }

  resetHighlight(object) {
    object.traverse((child) => {
      if (child.isMesh && child.originalMaterial) {
        child.material = child.originalMaterial;
        delete child.originalMaterial;
        delete child.isSelected;
      }
    });
  }

  pick(event) {
    const rect = this.viewer.container.getBoundingClientRect();
    this.mouse.x =
      ((event.clientX - rect.left) / this.viewer.container.clientWidth) * 2 - 1;
    this.mouse.y =
      -((event.clientY - rect.top) / this.viewer.container.clientHeight) * 2 +
      1;

    this.raycaster.setFromCamera(this.mouse, this.viewer.camera);
    const intersects = this.raycaster.intersectObjects(
      Array.from(this.viewer.models.values()),
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

  highlightElement(modelID, expressID) {
    // Reset previous highlighting
    if (this.selectedObject) {
      this.resetHighlight(this.selectedObject);
    }

    // Find and highlight the new element
    this.viewer.models.forEach((model) => {
      if (model.modelID === modelID) {
        model.traverse((child) => {
          if (
            child.name.startsWith("Element_") &&
            child.expressID === expressID
          ) {
            this.selectedObject = child;
            child.traverse((mesh) => {
              if (mesh.isMesh) {
                mesh.originalMaterial = mesh.material;
                mesh.material = this.selectedMaterial;
                mesh.isSelected = true;
              }
            });
          }
        });
      }
    });
  }
}
