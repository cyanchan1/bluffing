import { useEffect, useRef, useState } from 'react'
import type { SkinId } from './types'

const vertex = `attribute vec2 position; varying vec2 uv;
void main() { uv = position * .5 + .5; gl_Position = vec4(position, 0., 1.); }`
const fragment = `precision mediump float;
varying vec2 uv; uniform float time; uniform float theme;
vec3 palette(float t) { return .52 + .48*cos(6.28318*(vec3(.0,.33,.67)+t)); }
void main() {
  vec2 p = (uv-.5)*vec2(1.,1.42);
  float r = length(p), a = atan(p.y,p.x), t=time;
  vec3 c;
  if(theme < .5) {
    float lattice = pow(abs(sin((p.x+p.y)*44.)*sin((p.x-p.y)*44.)), 10.);
    c = mix(vec3(.025,.12,.105),vec3(.78,.59,.27),lattice*.7);
  } else if(theme < 1.5) {
    float wave = sin(p.x*8.+t*.4+sin(p.y*6.-t*.5));
    float foil = sin((p.y+wave*.16)*24.+t);
    c = palette(wave*.15+p.y*.35+t*.025)*(.35+.65*pow(.5+.5*foil,3.));
    c += vec3(.1,.65,.58)*pow(max(0.,1.-abs(wave)*1.5),4.)*.5;
  } else if(theme < 2.5) {
    float spiral = sin(a*5.+r*24.-t*1.4+sin(a*3.+t)*.7);
    float rays = pow(.5+.5*spiral,5.);
    float core = .055/(r+.055);
    c = mix(vec3(.16,.015,.24), vec3(1.,.22,.055), rays);
    c += vec3(1.,.65,.16)*core*1.5;
    c *= .7+.3*sin(r*70.-t*2.);
  } else {
    float facets = sin(p.x*22.+t*.45)*cos(p.y*16.-t*.3);
    float interference = sin((p.x+p.y)*30.+facets*4.+t*.7);
    c = palette(facets*.2+interference*.13+t*.035);
    c *= .28+.72*pow(.5+.5*interference,2.);
    c += vec3(.65,.8,1.)*pow(.5+.5*sin(p.x*40.-p.y*22.+t),28.)*.4;
  }
  float vignette = smoothstep(.95,.15,r);
  float scan = .96+.04*sin(uv.y*380.);
  gl_FragColor = vec4(c*(.62+.38*vignette)*scan,1.);
}`

/** Original procedural card art: no textures, external assets, or animation dependencies. */
export function CardBack({ skin, compact = false, surface = false }: { skin: SkinId; compact?: boolean; surface?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' })
    if (!gl) return // The CSS gradient stays visible when WebGL is unavailable.
    const shaders: WebGLShader[] = []
    const program = gl.createProgram()
    if (!program) return
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) return false
      shaders.push(shader)
      gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return false
      gl.attachShader(program, shader)
      return true
    }
    if (!compile(gl.VERTEX_SHADER, vertex) || !compile(gl.FRAGMENT_SHADER, fragment)) {
      shaders.forEach(s => gl.deleteShader(s)); gl.deleteProgram(program); return
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      shaders.forEach(s => gl.deleteShader(s)); gl.deleteProgram(program); return
    }
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW)
    gl.useProgram(program)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.uniform1f(gl.getUniformLocation(program, 'theme'), ['CLASSIC','AURORA','SUPERNOVA','PRISM'].indexOf(skin))
    const clock = gl.getUniformLocation(program, 'time')
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0, visible = true, lastFrame = 0, disposed = false
    const draw = (now: number) => {
      frame = 0
      if (disposed || !visible || document.hidden || gl.isContextLost()) return
      if (now - lastFrame >= 32 || reduced.matches) {
        const ratio = surface ? 1 : Math.min(devicePixelRatio || 1, 2)
        const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
        const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
        gl.viewport(0, 0, width, height)
        gl.uniform1f(clock, reduced.matches ? 3 : now / 1000)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
        canvas.style.opacity = '1'
        lastFrame = now
      }
      if (!reduced.matches && skin !== 'CLASSIC') frame = requestAnimationFrame(draw)
    }
    const resume = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw) }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume() })
    const resize = new ResizeObserver(resume)
    observer.observe(canvas); resize.observe(canvas)
    document.addEventListener('visibilitychange', resume)
    reduced.addEventListener('change', resume)
    const lost = (event: Event) => { event.preventDefault(); canvas.style.opacity = '0'; cancelAnimationFrame(frame) }
    const restored = () => setRevision(value => value + 1)
    canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', restored)
    resume()
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect()
      document.removeEventListener('visibilitychange', resume); reduced.removeEventListener('change', resume)
      canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored)
      gl.deleteBuffer(buffer); shaders.forEach(s => gl.deleteShader(s)); gl.deleteProgram(program)
    }
  }, [skin, revision, surface])
  return <div className={`skin-card skin-${skin.toLowerCase()} ${compact ? 'compact-back' : ''} ${surface ? 'shader-surface' : ''}`} aria-hidden={surface || undefined} aria-label={surface ? undefined : `${skin.toLowerCase()} card back`}>
    <canvas ref={canvasRef} aria-hidden="true" />
    {!surface && <div className="skin-engraving" aria-hidden="true"><span>✦</span><b>♠</b><span>✦</span></div>}
    {!compact && !surface && <span className="skin-signature" aria-hidden="true">BLUFF / {skin === 'CLASSIC' ? 'HOUSE' : skin}</span>}
  </div>
}
