import React, { useEffect, useState, useRef } from 'react';
import * as d3 from 'd3';

const NetworkGraph = () => {
  const svgRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [weightThreshold, setWeightThreshold] = useState(0.0008);
  const [nodeDegreeThreshold, setNodeDegreeThreshold] = useState(0);
  const [highlightedCategory, setHighlightedCategory] = useState("all");
  const [showLabels, setShowLabels] = useState(false);

  // Define categories and their colors
  const nodeCategories = {
    "Signaling": { color: "#FF5733", test: (id) => id.includes("MAPK") || id.includes("PIK3") || id.includes("AKT") || id.includes("SRC") || id.includes("JAK") || id.includes("STAT") || id.includes("RAF") || id.includes("RAS") },
    "Transcription Factors": { color: "#33A1FF", test: (id) => (id.length >= 4 && /^[A-Z]+\d*$/.test(id) && !id.startsWith("RPL") && !id.startsWith("RPS") && !id.startsWith("MT")) },
    "Receptors": { color: "#33FF57", test: (id) => id.includes("EGFR") || id.endsWith("R") || id.includes("CD") || id.includes("HLA") || id.includes("TLR") },
    "Immune": { color: "#B533FF", test: (id) => id.startsWith("IL") || id.startsWith("IFN") || id.startsWith("TNF") || id.startsWith("CD") || id.startsWith("HLA") || id.includes("TLR") },
    "Cancer": { color: "#FF33A1", test: (id) => ["EGFR", "PTEN", "TP53", "MYC", "CTNNB1", "KRAS", "BRAF", "CDKN2A", "PIK3CA", "ATM", "MDM2"].includes(id) },
    "Ribosomal": { color: "#33FFF9", test: (id) => id.startsWith("RPL") || id.startsWith("RPS") },
    "Cell Cycle": { color: "#FFBD33", test: (id) => id.includes("CDK") || id.includes("CCND") || id.includes("CDC") || id.includes("CDKN") },
    "Other": { color: "#AAAAAA", test: (id) => true }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await window.fs.readFile("digital_twin_network.gexf", { encoding: 'utf8' });
        
        // Extract nodes
        const nodeRegex = /<node id="([^"]+)" label="([^"]+)" \/>/g;
        const nodes = [];
        let nodeMatch;
        while ((nodeMatch = nodeRegex.exec(response)) !== null) {
          nodes.push({
            id: nodeMatch[1],
            label: nodeMatch[2]
          });
        }
        
        // Extract edges
        const edgeRegex = /<edge source="([^"]+)" target="([^"]+)" id="(\d+)" weight="([^"]+)" \/>/g;
        const edges = [];
        let edgeMatch;
        while ((edgeMatch = edgeRegex.exec(response)) !== null) {
          edges.push({
            source: edgeMatch[1],
            target: edgeMatch[2],
            id: parseInt(edgeMatch[3]),
            weight: parseFloat(edgeMatch[4])
          });
        }
        
        // Calculate node degrees
        const nodeDegrees = {};
        nodes.forEach(node => {
          nodeDegrees[node.id] = 0;
        });
        
        edges.forEach(edge => {
          nodeDegrees[edge.source] = (nodeDegrees[edge.source] || 0) + 1;
          nodeDegrees[edge.target] = (nodeDegrees[edge.target] || 0) + 1;
        });
        
        // Add degree to nodes
        nodes.forEach(node => {
          node.degree = nodeDegrees[node.id] || 0;
        });
        
        setData({ nodes, edges, nodeDegrees });
        setLoading(false);
      } catch (error) {
        console.error("Error loading data:", error);
        setError("Failed to load network data");
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  useEffect(() => {
    if (!data || loading) return;
    
    // Filter nodes based on degree threshold
    const filteredNodes = data.nodes.filter(node => node.degree > nodeDegreeThreshold);
    const filteredNodeIds = new Set(filteredNodes.map(node => node.id));
    
    // Filter edges based on weight threshold and node filtering
    const filteredEdges = data.edges.filter(edge => 
      edge.weight >= weightThreshold && 
      filteredNodeIds.has(edge.source) && 
      filteredNodeIds.has(edge.target)
    );

    // Create a networkGraph structure
    const width = 800;
    const height = 600;
    
    // Clear previous SVG content
    d3.select(svgRef.current).selectAll("*").remove();
    
    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height);
    
    // Add zoom functionality
    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    
    svg.call(zoom);
    
    const g = svg.append("g");
    
    // Add a border around the SVG
    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "none")
      .attr("stroke", "#ccc");

    // Determine node category and color
    const getNodeCategory = (node) => {
      for (const [category, { test }] of Object.entries(nodeCategories)) {
        if (category === "Other") continue; // Skip the "Other" category initially
        if (test(node.id)) return category;
      }
      return "Other"; // Default category
    };

    const getNodeColor = (node) => {
      const category = getNodeCategory(node);
      return nodeCategories[category].color;
    };
    
    // Create force simulation
    const simulation = d3.forceSimulation(filteredNodes)
      .force("link", d3.forceLink(filteredEdges)
        .id(d => d.id)
        .distance(d => 100 / (d.weight * 100)) // Stronger links are shorter
      )
      .force("charge", d3.forceManyBody().strength(-150))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(d => Math.sqrt(d.degree) * 3 + 5));
    
    // Create links
    const link = g.append("g")
      .selectAll("line")
      .data(filteredEdges)
      .enter().append("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", d => d.weight * 1000) // Higher weight = more visible
      .attr("stroke-width", d => Math.max(1, d.weight * 5000 - 3));
    
    // Create nodes
    const node = g.append("g")
      .selectAll("circle")
      .data(filteredNodes)
      .enter().append("circle")
      .attr("r", d => Math.sqrt(d.degree) * 2 + 3)
      .attr("fill", d => {
        const category = getNodeCategory(d);
        return highlightedCategory === "all" || highlightedCategory === category
          ? nodeCategories[category].color
          : "#dddddd";
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .on("click", (event, d) => {
        setSelectedNode(d);
        event.stopPropagation();
      })
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));
    
    // Node labels (only for nodes with high degree if showLabels is true)
    if (showLabels) {
      const labels = g.append("g")
        .selectAll("text")
        .data(filteredNodes.filter(d => d.degree > 15 || (selectedNode && d.id === selectedNode.id)))
        .enter().append("text")
        .attr("dx", 12)
        .attr("dy", ".35em")
        .text(d => d.id)
        .style("font-size", "10px")
        .style("fill", "#333");
      
      simulation.on("tick", () => {
        link
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);
        
        node
          .attr("cx", d => d.x = Math.max(5, Math.min(width - 5, d.x)))
          .attr("cy", d => d.y = Math.max(5, Math.min(height - 5, d.y)));
        
        labels
          .attr("x", d => d.x)
          .attr("y", d => d.y);
      });
    } else {
      simulation.on("tick", () => {
        link
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);
        
        node
          .attr("cx", d => d.x = Math.max(5, Math.min(width - 5, d.x)))
          .attr("cy", d => d.y = Math.max(5, Math.min(height - 5, d.y)));
      });
    }
    
    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    
    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    
    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    // Add a click handler to the SVG to clear selection
    svg.on("click", () => {
      setSelectedNode(null);
    });
    
    // Create a legend for node categories
    const legend = svg.append("g")
      .attr("transform", "translate(20, 20)");
    
    const categories = Object.entries(nodeCategories);
    categories.forEach(([category, { color }], i) => {
      const legendRow = legend.append("g")
        .attr("transform", `translate(0, ${i * 20})`)
        .style("cursor", "pointer")
        .on("click", () => {
          setHighlightedCategory(highlightedCategory === category ? "all" : category);
        });
      
      legendRow.append("rect")
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", color);
      
      legendRow.append("text")
        .attr("x", 15)
        .attr("y", 10)
        .text(category)
        .style("font-size", "12px")
        .style("fill", highlightedCategory === category ? "#000" : "#666");
    });
    
    return () => {
      simulation.stop();
    };
  }, [data, loading, weightThreshold, nodeDegreeThreshold, highlightedCategory, showLabels, selectedNode]);

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading network data...</div>;
  }

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  // Count nodes and edges that pass the current filters
  const filteredNodeCount = data ? data.nodes.filter(node => node.degree > nodeDegreeThreshold).length : 0;
  const filteredEdgeCount = data ? data.edges.filter(edge => edge.weight >= weightThreshold).length : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="bg-gray-100 p-4 mb-4 rounded-lg">
        <h2 className="text-xl font-bold mb-2">Digital Twin Network Visualization</h2>
        <div className="flex flex-wrap gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Min. Connection Weight:</label>
            <input
              type="range"
              min="0.0007"
              max="0.001"
              step="0.00001"
              value={weightThreshold}
              onChange={(e) => setWeightThreshold(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-gray-500">{weightThreshold.toFixed(6)}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Min. Node Degree:</label>
            <input
              type="range"
              min="0"
              max="30"
              step="1"
              value={nodeDegreeThreshold}
              onChange={(e) => setNodeDegreeThreshold(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-gray-500">{nodeDegreeThreshold} connections</div>
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="showLabels"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="showLabels" className="text-sm font-medium text-gray-700">Show Labels</label>
          </div>
        </div>
        <div className="text-sm text-gray-700">
          Showing {filteredNodeCount} nodes and approximately {filteredEdgeCount} connections.
          {selectedNode && (
            <div className="mt-2 p-2 bg-blue-50 rounded">
              <h3 className="font-bold">{selectedNode.id} ({selectedNode.label})</h3>
              <p>Connections: {selectedNode.degree}</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex-grow border border-gray-300 rounded-lg overflow-hidden">
        <svg ref={svgRef} className="w-full h-full"></svg>
      </div>
    </div>
  );
};

export default NetworkGraph;
