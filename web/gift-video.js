/* Composite the original MP4 over the app without displaying the source video.
   Dark foliage keeps its color; pixels dominated by the screen green fade out. */
const giftVideoVertex=`
  attribute vec2 position;
  varying vec2 uv;
  void main(){
    uv=vec2(position.x*.5+.5,.5-position.y*.5);
    gl_Position=vec4(position,0.,1.);
  }`;
const giftVideoFragment=`
  precision mediump float;
  varying vec2 uv;
  uniform sampler2D frame;
  uniform vec3 green;
  uniform vec2 threshold;
  void main(){
    vec3 rgb=texture2D(frame,uv).rgb;
    float excess=rgb.g-max(rgb.r,rgb.b);
    float removed=smoothstep(threshold.x,threshold.y,excess);
    float alpha=1.-removed;
    vec3 foreground=max(rgb-removed*green,0.);
    foreground.g=mix(foreground.g,min(foreground.g,max(foreground.r,foreground.b)),removed);
    gl_FragColor=vec4(min(foreground,vec3(alpha)),alpha);
  }`;

function giftScreenColor(video){
  const sample=document.createElement('canvas');
  sample.width=sample.height=16;
  const context=sample.getContext('2d');
  context.drawImage(video,0,0,16,16);
  const pixels=context.getImageData(0,0,16,16).data;
  const corners=[0,15,240,255].map(offset=>Array.from(pixels.subarray(offset*4,offset*4+3),value=>value/255));
  const green=corners.filter(([r,g,b])=>g-Math.max(r,b)>=.15);
  if(green.length<3)return null;
  return [0,1,2].map(channel=>green.reduce((sum,pixel)=>sum+pixel[channel],0)/green.length);
}

function createGiftVideoRenderer(canvas,video){
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,depth:false,antialias:false});
  if(!gl)throw new Error('Gift video compositor is unavailable');
  const destroy=()=>gl.getExtension('WEBGL_lose_context')?.loseContext();
  try{
    const screen=giftScreenColor(video);
    const compile=(type,source)=>{
      const shader=gl.createShader(type);
      gl.shaderSource(shader,source);
      gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Gift video shader could not compile');
      return shader;
    };
    const vertex=compile(gl.VERTEX_SHADER,giftVideoVertex),fragment=compile(gl.FRAGMENT_SHADER,giftVideoFragment);
    const program=gl.createProgram();
    gl.attachShader(program,vertex);
    gl.attachShader(program,fragment);
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Gift video shader could not link');
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.useProgram(program);
    const buffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const texture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const dominance=screen?screen[1]-Math.max(screen[0],screen[2]):0;
    gl.uniform3fv(gl.getUniformLocation(program,'green'),screen||[0,0,0]);
    gl.uniform2f(gl.getUniformLocation(program,'threshold'),screen?dominance*.24:1,screen?dominance*.77:2);
    canvas.width=video.videoWidth;
    canvas.height=video.videoHeight;
    gl.viewport(0,0,canvas.width,canvas.height);
    return {
      draw(){
        if(gl.isContextLost())throw new Error('Gift video compositor stopped');
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,video);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      },
      destroy(){
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        destroy();
      }
    };
  }catch(error){destroy();throw error}
}
