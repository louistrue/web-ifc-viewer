import { IFCViewer } from "../app";
import { Connections } from "./Connections";

export class FloatingMenu {
  private viewer: IFCViewer;
  private connections: Connections;
  private menu: HTMLElement | null = null;

  constructor(viewer: IFCViewer) {
    this.viewer = viewer;
    this.connections = new Connections(viewer);
    this.setupFloatingMenu();
  }

  private setupFloatingMenu(): void {
    // Create floating menu
    this.menu = document.createElement("div");
    this.menu.className = "floating-menu";
    this.menu.innerHTML = `
      <button class="menu-btn" title="Hide/Show Selected (Space)">
        <i class="fas fa-eye"></i>
      </button>
      <button class="menu-btn" title="Isolate Selected">
        <i class="fas fa-expand"></i>
      </button>
      <button class="menu-btn" title="Show All">
        <i class="fas fa-border-all"></i>
      </button>
      <button class="menu-btn analyze-btn" title="Analyze Connections">
        <i class="fas fa-project-diagram"></i>
      </button>
    `;

    // Add event listeners
    const buttons = this.menu.querySelectorAll(".menu-btn");
    const [hideBtn, isolateBtn, showAllBtn, connectionsBtn] = Array.from(buttons);

    if (hideBtn) {
      hideBtn.addEventListener("click", () => this.viewer.toggleSelectedVisibility());
    }
    
    if (isolateBtn) {
      isolateBtn.addEventListener("click", () => this.viewer.isolateSelected());
    }
    
    if (showAllBtn) {
      showAllBtn.addEventListener("click", () => this.viewer.showAll());
    }
    
    if (connectionsBtn) {
      connectionsBtn.addEventListener("click", () => {
        // Toggle connections section visibility
        const connectionsSection = document.querySelector<HTMLElement>(".connections-section");
        if (connectionsSection) {
          const isHidden = connectionsSection.classList.toggle("hidden");
          if (!isHidden) {
            this.connections.analyzeConnections();
          } else {
            this.connections.exitConnectionMode();
          }
        }
      });
    }

    document.body.appendChild(this.menu);

    // Create connections section in the left panel
    const modelsContent = document.querySelector(".models-content");
    if (modelsContent) {
      const connectionsSection = document.createElement("div");
      connectionsSection.className = "connections-section hidden";
      connectionsSection.innerHTML = `
        <div class="section-header">
          <h3>Connections</h3>
        </div>
        <div class="connection-filters">
          <div class="filter-group">
            <label>Visibility Controls</label>
            <div class="visibility-controls">
              <label><input type="checkbox" class="type-toggle" data-type="point" checked> Point</label>
              <label><input type="checkbox" class="type-toggle" data-type="line" checked> Line</label>
              <label><input type="checkbox" class="type-toggle" data-type="surface" checked> Surface</label>
            </div>
            <div class="label-control">
              <label><input type="checkbox" id="show-labels"> Show All Labels</label>
            </div>
          </div>
        </div>
        <div class="connections-list"></div>
      `;

      modelsContent.appendChild(connectionsSection);

      // Add event listeners for visibility controls
      const typeToggles = connectionsSection.querySelectorAll<HTMLInputElement>(".type-toggle");
      typeToggles.forEach((toggle) => {
        toggle.addEventListener("change", (e) => {
          const target = e.target as HTMLInputElement;
          const type = target.dataset.type;
          if (this.connections.connectionVisualizer && type) {
            this.connections.connectionVisualizer.setTypeVisibility(
              type,
              target.checked
            );
          }
        });
      });

      // Add event listener for label visibility
      const labelToggle = connectionsSection.querySelector<HTMLInputElement>("#show-labels");
      if (labelToggle) {
        labelToggle.addEventListener("change", (e) => {
          const target = e.target as HTMLInputElement;
          if (this.connections.connectionVisualizer) {
            this.connections.connectionVisualizer.setGlobalLabelVisibility(
              target.checked
            );
          }
        });
      }
    }
  }

  private async handleAnalyzeConnections(): Promise<void> {
    try {
      const analyzeBtn = this.menu?.querySelector('.analyze-btn');
      if (!analyzeBtn) return;

      analyzeBtn.classList.add('loading');
      analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      
      await this.viewer.getConnections().analyzeConnections();
      
      analyzeBtn.classList.remove('loading');
      analyzeBtn.innerHTML = '<i class="fas fa-project-diagram"></i>';
    } catch (error) {
      const analyzeBtn = this.menu?.querySelector('.analyze-btn');
      if (analyzeBtn) {
        analyzeBtn.classList.remove('loading');
        analyzeBtn.innerHTML = '<i class="fas fa-exclamation-circle"></i>';
        
        // Reset button after delay
        setTimeout(() => {
          analyzeBtn.innerHTML = '<i class="fas fa-project-diagram"></i>';
        }, 3000);
      }
    }
  }
} 