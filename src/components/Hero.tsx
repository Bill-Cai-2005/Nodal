import { Component, ErrorInfo, ReactNode } from 'react'
import ToyGraph from './ToyGraph'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Graph error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          background: '#111', 
          height: '100%', 
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#00d4ff'
        }}>
          <div>Graph unavailable</div>
        </div>
      )
    }

    return this.props.children
  }
}

const Hero = () => {
  return (
    <div className="hero">
      <div className="hero-graph">
        <ErrorBoundary>
          <ToyGraph />
        </ErrorBoundary>
      </div>
    </div>
  )
}

export default Hero
