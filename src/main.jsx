import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class RuntimeErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Portfolio Control render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: '"IBM Plex Sans","PingFang SC",sans-serif', color: "#7f1d1d" }}>
          <h1 style={{ marginTop: 0 }}>App Error</h1>
          <p>The page crashed during render. Copy the message below and send it back.</p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#fff7ed",
              border: "1px solid #fdba74",
              borderRadius: 12,
              padding: 16,
              color: "#7f1d1d",
            }}
          >
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RuntimeErrorBoundary>
      <App />
    </RuntimeErrorBoundary>
  </React.StrictMode>
);
