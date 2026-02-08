/**
 * Flow View type definitions
 * Represents pages and connections in a multi-page app flow diagram
 */

export interface FlowPage {
  id: string;
  name: string;
  route: string;
}

export interface FlowConnection {
  from: string;
  to: string;
  label?: string;
}

export interface FlowManifest {
  pages: FlowPage[];
  connections: FlowConnection[];
}

export interface FlowNodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  nodes: FlowNodePosition[];
  width: number;
  height: number;
}
