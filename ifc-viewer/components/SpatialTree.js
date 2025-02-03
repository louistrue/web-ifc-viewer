import { IFCBUILDING, IFCBUILDINGSTOREY, IFCPROJECT, IFCSITE } from "web-ifc";

export class SpatialTree {
  constructor(viewer) {
    this.viewer = viewer;
  }

  async buildSpatialTree(modelID) {
    try {
      console.log("Building spatial tree...");
      const modelId = Array.from(this.viewer.models.entries()).find(
        ([_, m]) => m.modelID === modelID
      )?.[0];
      const treeContent = document.getElementById(`model-tree-${modelId}`);
      if (!treeContent) return;

      treeContent.innerHTML = ""; // Clear existing tree

      // Get all IfcProject elements (usually just one)
      const projectLines = await this.viewer.ifcAPI.GetLineIDsWithType(
        modelID,
        IFCPROJECT
      );
      console.log(`Found ${projectLines.size()} project(s)`);

      for (let i = 0; i < projectLines.size(); i++) {
        const projectID = projectLines.get(i);
        const project = await this.viewer.ifcAPI.GetLine(
          modelID,
          projectID,
          true
        );
        console.log("Project:", project);

        // Create project node
        const projectNode = this.createTreeItem(
          project.Name?.value || "Project",
          "fas fa-building",
          modelID,
          projectID
        );
        treeContent.appendChild(projectNode);
        projectNode.classList.add("expanded"); // Auto-expand project node

        // Get and process sites
        const siteLines = await this.viewer.ifcAPI.GetLineIDsWithType(
          modelID,
          IFCSITE
        );
        for (let j = 0; j < siteLines.size(); j++) {
          const siteID = siteLines.get(j);
          const site = await this.viewer.ifcAPI.GetLine(modelID, siteID, true);
          const siteNode = this.createTreeItem(
            site.Name?.value || "Site",
            "fas fa-map-marker-alt",
            modelID,
            siteID
          );
          projectNode
            .querySelector(".tree-item-children")
            .appendChild(siteNode);
          siteNode.classList.add("expanded");

          // Get and process buildings
          const buildingLines = await this.viewer.ifcAPI.GetLineIDsWithType(
            modelID,
            IFCBUILDING
          );
          for (let k = 0; k < buildingLines.size(); k++) {
            const buildingID = buildingLines.get(k);
            const building = await this.viewer.ifcAPI.GetLine(
              modelID,
              buildingID,
              true
            );
            const buildingNode = this.createTreeItem(
              building.Name?.value || "Building",
              "fas fa-building",
              modelID,
              buildingID
            );
            siteNode
              .querySelector(".tree-item-children")
              .appendChild(buildingNode);
            buildingNode.classList.add("expanded");

            // Get and process building storeys
            const storeyLines = await this.viewer.ifcAPI.GetLineIDsWithType(
              modelID,
              IFCBUILDINGSTOREY
            );
            const storeys = [];
            for (let l = 0; l < storeyLines.size(); l++) {
              const storeyID = storeyLines.get(l);
              const storey = await this.viewer.ifcAPI.GetLine(
                modelID,
                storeyID,
                true
              );
              storeys.push({ id: storeyID, data: storey });
            }

            // Sort storeys by elevation
            storeys.sort((a, b) => {
              const elevA = a.data.Elevation?.value || 0;
              const elevB = b.data.Elevation?.value || 0;
              return elevA - elevB;
            });

            // Add sorted storeys to building
            for (const storey of storeys) {
              const storeyNode = this.createTreeItem(
                storey.data.Name?.value || "Storey",
                "fas fa-layer-group",
                modelID,
                storey.id
              );
              buildingNode
                .querySelector(".tree-item-children")
                .appendChild(storeyNode);
              storeyNode.classList.add("expanded");

              // Process spaces and other elements in the storey
              if (storey.data.ContainsElements) {
                await this.processContainment(
                  modelID,
                  storey.data.ContainsElements,
                  storeyNode.querySelector(".tree-item-children")
                );
              }
            }
          }
        }
      }

      // Add click handlers
      const treeItems = treeContent.querySelectorAll(".tree-item-header");
      treeItems.forEach((item) => {
        item.addEventListener("click", (event) => {
          event.stopPropagation();
          const treeItem = item.parentElement;

          // Toggle expansion
          if (event.target.closest(".tree-item-toggle")) {
            treeItem.classList.toggle("expanded");
            const icon = item.querySelector(".tree-item-toggle i");
            icon.classList.toggle("fa-chevron-right");
            icon.classList.toggle("fa-chevron-down");
          } else {
            // Handle selection
            const modelID = parseInt(item.dataset.modelId);
            const expressID = parseInt(item.dataset.expressId);

            // Remove previous selection
            const prevSelected = treeContent.querySelector(
              ".tree-item-header.selected"
            );
            if (prevSelected) {
              prevSelected.classList.remove("selected");
            }

            // Add new selection
            item.classList.add("selected");

            // Highlight the element in the 3D view and trigger property display
            const result = {
              modelID,
              expressID,
              object: this.findElementInScene(modelID, expressID),
            };
            if (result.object) {
              this.viewer.picker.handleClick({
                clientX: event.clientX,
                clientY: event.clientY,
                target: event.target,
                type: "click",
                preventDefault: () => {},
                stopPropagation: () => {},
              });
            }
          }
        });
      });
    } catch (error) {
      console.error("Error building spatial tree:", error);
    }
  }

  async processDecomposition(modelID, decomposedBy, parentNode) {
    const relations = Array.isArray(decomposedBy)
      ? decomposedBy
      : [decomposedBy];

    for (const rel of relations) {
      if (rel && rel.value) {
        const decomposition = await this.viewer.ifcAPI.GetLine(
          modelID,
          rel.value,
          true
        );
        if (decomposition && decomposition.RelatedObjects) {
          const relatedObjects = Array.isArray(decomposition.RelatedObjects)
            ? decomposition.RelatedObjects
            : [decomposition.RelatedObjects];

          for (const obj of relatedObjects) {
            if (obj && obj.value) {
              const element = await this.viewer.ifcAPI.GetLine(
                modelID,
                obj.value,
                true
              );
              if (!element) continue;

              const treeItem = await this.processSpatialElement(
                modelID,
                obj.value,
                parentNode
              );
              if (treeItem) {
                treeItem.classList.add("expanded"); // Auto-expand all nodes

                // Process decomposition
                if (element.IsDecomposedBy) {
                  await this.processDecomposition(
                    modelID,
                    element.IsDecomposedBy,
                    treeItem.querySelector(".tree-item-children")
                  );
                }

                // Process containment
                if (element.ContainsElements) {
                  await this.processContainment(
                    modelID,
                    element.ContainsElements,
                    treeItem.querySelector(".tree-item-children")
                  );
                }
              }
            }
          }
        }
      }
    }
  }

  async processContainment(modelID, contains, parentNode) {
    const relations = Array.isArray(contains) ? contains : [contains];

    for (const rel of relations) {
      if (rel && rel.value) {
        const containment = await this.viewer.ifcAPI.GetLine(
          modelID,
          rel.value,
          true
        );
        if (containment && containment.RelatedElements) {
          const relatedElements = Array.isArray(containment.RelatedElements)
            ? containment.RelatedElements
            : [containment.RelatedElements];

          for (const elem of relatedElements) {
            if (elem && elem.value) {
              await this.processSpatialElement(modelID, elem.value, parentNode);
            }
          }
        }
      }
    }
  }

  async processSpatialElement(modelID, elementID, parentNode) {
    try {
      const element = await this.viewer.ifcAPI.GetLine(
        modelID,
        elementID,
        true
      );
      if (!element) return null;

      // Get element type and icon
      const type = element.__proto__?.constructor?.name || "Unknown";
      let icon = "fas fa-cube";

      switch (type) {
        case "IfcSite":
          icon = "fas fa-map-marker-alt";
          break;
        case "IfcBuilding":
          icon = "fas fa-building";
          break;
        case "IfcBuildingStorey":
          icon = "fas fa-layer-group";
          break;
        case "IfcSpace":
          icon = "fas fa-square";
          break;
        case "IfcWall":
          icon = "fas fa-grip-lines-vertical";
          break;
        case "IfcWindow":
          icon = "fas fa-window-maximize";
          break;
        case "IfcDoor":
          icon = "fas fa-door-open";
          break;
        case "IfcStair":
          icon = "fas fa-stairs";
          break;
        case "IfcColumn":
          icon = "fas fa-grip-vertical";
          break;
        case "IfcBeam":
          icon = "fas fa-grip-horizontal";
          break;
        case "IfcSlab":
          icon = "fas fa-square";
          break;
        case "IfcRoof":
          icon = "fas fa-home";
          break;
      }

      // Create tree item
      const treeItem = this.createTreeItem(
        element.Name?.value || type.replace("Ifc", ""),
        icon,
        modelID,
        elementID
      );
      parentNode.appendChild(treeItem);

      return treeItem;
    } catch (error) {
      console.error(`Error processing spatial element ${elementID}:`, error);
      return null;
    }
  }

  createTreeItem(label, icon, modelID, expressID) {
    const item = document.createElement("div");
    item.className = "tree-item";

    const header = document.createElement("div");
    header.className = "tree-item-header";
    header.dataset.modelId = modelID;
    header.dataset.expressId = expressID;

    const toggle = document.createElement("div");
    toggle.className = "tree-item-toggle";
    toggle.innerHTML = '<i class="fas fa-chevron-right"></i>';

    const iconDiv = document.createElement("div");
    iconDiv.className = "tree-item-icon";
    iconDiv.innerHTML = `<i class="${icon}"></i>`;

    const labelDiv = document.createElement("div");
    labelDiv.className = "tree-item-label";
    labelDiv.textContent = label;
    labelDiv.title = label;

    header.appendChild(toggle);
    header.appendChild(iconDiv);
    header.appendChild(labelDiv);

    const children = document.createElement("div");
    children.className = "tree-item-children";

    item.appendChild(header);
    item.appendChild(children);

    return item;
  }

  findElementInScene(modelID, expressID) {
    let foundElement = null;
    this.viewer.models.forEach((model) => {
      if (model.modelID === modelID) {
        model.traverse((child) => {
          if (
            child.name.startsWith("Element_") &&
            child.expressID === expressID
          ) {
            foundElement = child;
          }
        });
      }
    });
    return foundElement;
  }
}
