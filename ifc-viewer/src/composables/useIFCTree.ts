import { ref, Ref } from "vue";
import { IfcAPI } from "web-ifc";
import type { TreeNode, TreeItem } from "@/types/ifc";

const IFCPROJECT = 0x11;
const IFCSITE = 0x14;
const IFCBUILDING = 0x15;
const IFCBUILDINGSTOREY = 0x16;

interface IFCTreeOptions {
  onElementSelected?: (modelID: number, expressID: number) => void;
}

export function useIFCTree(options: IFCTreeOptions = {}) {
  const treeData: Ref<TreeItem[]> = ref([]);

  function getIconForType(type: string): string {
    switch (type) {
      case "IFCPROJECT":
        return "fas fa-building";
      case "IFCSITE":
        return "fas fa-map-marker-alt";
      case "IFCBUILDING":
        return "fas fa-building";
      case "IFCBUILDINGSTOREY":
        return "fas fa-layer-group";
      case "IFCSPACE":
        return "fas fa-square";
      case "IFCWALL":
        return "fas fa-grip-lines-vertical";
      case "IFCWINDOW":
        return "fas fa-window-maximize";
      case "IFCDOOR":
        return "fas fa-door-open";
      case "IFCSTAIR":
        return "fas fa-stairs";
      case "IFCCOLUMN":
        return "fas fa-grip-vertical";
      case "IFCBEAM":
        return "fas fa-grip-horizontal";
      case "IFCSLAB":
        return "fas fa-square";
      case "IFCROOF":
        return "fas fa-home";
      default:
        return "fas fa-cube";
    }
  }

  async function buildSpatialTree(
    ifcAPI: IfcAPI,
    modelID: number
  ): Promise<TreeItem[]> {
    const tree: TreeItem[] = [];

    try {
      // Get all projects
      const projectLines = await ifcAPI.GetLineIDsWithType(modelID, IFCPROJECT);

      for (let i = 0; i < projectLines.size(); i++) {
        const projectID = projectLines.get(i);
        const project = await ifcAPI.GetLine(modelID, projectID, true);

        const projectItem: TreeItem = {
          label: project.Name?.value || "Project",
          icon: getIconForType("IFCPROJECT"),
          modelID,
          expressID: projectID,
          children: [],
        };

        // Get all sites
        if (project.Sites) {
          for (const siteRef of project.Sites) {
            const site = await ifcAPI.GetLine(modelID, siteRef.value, true);
            const siteItem: TreeItem = {
              label: site.Name?.value || "Site",
              icon: getIconForType("IFCSITE"),
              modelID,
              expressID: siteRef.value,
              children: [],
            };

            // Get all buildings
            if (site.Buildings) {
              for (const buildingRef of site.Buildings) {
                const building = await ifcAPI.GetLine(
                  modelID,
                  buildingRef.value,
                  true
                );
                const buildingItem: TreeItem = {
                  label: building.Name?.value || "Building",
                  icon: getIconForType("IFCBUILDING"),
                  modelID,
                  expressID: buildingRef.value,
                  children: [],
                };

                // Get all storeys
                if (building.BuildingStoreys) {
                  const storeys = [];
                  for (const storeyRef of building.BuildingStoreys) {
                    const storey = await ifcAPI.GetLine(
                      modelID,
                      storeyRef.value,
                      true
                    );
                    storeys.push({
                      data: storey,
                      id: storeyRef.value,
                    });
                  }

                  // Sort storeys by elevation
                  storeys.sort((a, b) => {
                    const elevA = a.data.Elevation?.value || 0;
                    const elevB = b.data.Elevation?.value || 0;
                    return elevA - elevB;
                  });

                  // Add sorted storeys
                  for (const storey of storeys) {
                    const storeyItem: TreeItem = {
                      label: storey.data.Name?.value || "Storey",
                      icon: getIconForType("IFCBUILDINGSTOREY"),
                      modelID,
                      expressID: storey.id,
                      children: [],
                    };

                    // Process contained elements
                    if (storey.data.ContainsElements) {
                      await processContainment(
                        ifcAPI,
                        modelID,
                        storey.data.ContainsElements,
                        storeyItem.children
                      );
                    }

                    buildingItem.children.push(storeyItem);
                  }
                }

                siteItem.children.push(buildingItem);
              }
            }

            projectItem.children.push(siteItem);
          }
        }

        tree.push(projectItem);
      }
    } catch (error) {
      console.error("Error building spatial tree:", error);
    }

    return tree;
  }

  async function processContainment(
    ifcAPI: IfcAPI,
    modelID: number,
    containment: any,
    children: TreeItem[]
  ) {
    const elements = Array.isArray(containment) ? containment : [containment];

    for (const element of elements) {
      if (element && element.value) {
        const elementData = await ifcAPI.GetLine(modelID, element.value, true);
        if (!elementData) continue;

        const type = elementData.__proto__?.constructor?.name || "Unknown";
        const item: TreeItem = {
          label: elementData.Name?.value || type.replace("Ifc", ""),
          icon: getIconForType(type.toUpperCase()),
          modelID,
          expressID: element.value,
          children: [],
        };

        children.push(item);

        // Process decomposition if exists
        if (elementData.IsDecomposedBy) {
          await processDecomposition(
            ifcAPI,
            modelID,
            elementData.IsDecomposedBy,
            item.children
          );
        }
      }
    }
  }

  async function processDecomposition(
    ifcAPI: IfcAPI,
    modelID: number,
    decomposedBy: any,
    children: TreeItem[]
  ) {
    const relations = Array.isArray(decomposedBy)
      ? decomposedBy
      : [decomposedBy];

    for (const rel of relations) {
      if (rel && rel.value) {
        const decomposition = await ifcAPI.GetLine(modelID, rel.value, true);
        if (decomposition && decomposition.RelatedObjects) {
          const relatedObjects = Array.isArray(decomposition.RelatedObjects)
            ? decomposition.RelatedObjects
            : [decomposition.RelatedObjects];

          for (const obj of relatedObjects) {
            if (obj && obj.value) {
              const element = await ifcAPI.GetLine(modelID, obj.value, true);
              if (!element) continue;

              const type = element.__proto__?.constructor?.name || "Unknown";
              const item: TreeItem = {
                label: element.Name?.value || type.replace("Ifc", ""),
                icon: getIconForType(type.toUpperCase()),
                modelID,
                expressID: obj.value,
                children: [],
              };

              children.push(item);

              // Process further decomposition
              if (element.IsDecomposedBy) {
                await processDecomposition(
                  ifcAPI,
                  modelID,
                  element.IsDecomposedBy,
                  item.children
                );
              }

              // Process containment
              if (element.ContainsElements) {
                await processContainment(
                  ifcAPI,
                  modelID,
                  element.ContainsElements,
                  item.children
                );
              }
            }
          }
        }
      }
    }
  }

  async function updateTreeForModel(ifcAPI: IfcAPI, modelID: number) {
    const newTree = await buildSpatialTree(ifcAPI, modelID);
    treeData.value = [...treeData.value, ...newTree];
  }

  function handleTreeItemClick(modelID: number, expressID: number) {
    options.onElementSelected?.(modelID, expressID);
  }

  return {
    treeData,
    updateTreeForModel,
    handleTreeItemClick,
  };
}
