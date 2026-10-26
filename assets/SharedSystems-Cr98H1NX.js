import{$ as e,A as t,B as n,D as r,E as i,H as a,I as o,L as s,M as c,O as l,P as u,R as d,T as ee,U as f,W as te,X as p,Y as m,Z as h,at as ne,ct as g,dt as re,et as ie,ft as ae,ht as _,j as oe,k as v,lt as y,mt as b,n as se,nt as x,o as ce,ot as le,q as ue,s as de,t as fe,ut as S,v as pe,x as C,y as w}from"./colorToUniform-BAq_mPrO.js";var me=class e extends i{constructor(t){t={...e.defaultOptions,...t},super(t),this.enabled=!0,this._state=ee.for2d(),this.blendMode=t.blendMode,this.padding=t.padding,this.antialias=typeof t.antialias==`boolean`?t.antialias?`on`:`off`:t.antialias,this.resolution=t.resolution,this.blendRequired=t.blendRequired,this.clipToViewport=t.clipToViewport,this.addResource(`uTexture`,0,1)}apply(e,t,n,r){e.applyFilter(this,t,n,r)}get blendMode(){return this._state.blendMode}set blendMode(e){this._state.blendMode=e}static from(n){let{gpu:r,gl:i,...a}=n,o,s;return r&&(o=t.from(r)),i&&(s=c.from(i)),new e({gpuProgram:o,glProgram:s,...a})}};me.defaultOptions={blendMode:`normal`,resolution:1,padding:0,antialias:`off`,blendRequired:!1,clipToViewport:!0};var he=me,T=[];_.handleByNamedList(b.Environment,T);async function ge(e){if(!e)for(let e=0;e<T.length;e++){let t=T[e];if(t.value.test()){await t.value.load();return}}}var E;function _e(){if(typeof E==`boolean`)return E;try{E=Function(`param1`,`param2`,`param3`,`return param1[param2] === param3;`)({a:`b`},`a`,`b`)===!0}catch{E=!1}return E}var D=(e=>(e[e.NONE=0]=`NONE`,e[e.COLOR=16384]=`COLOR`,e[e.STENCIL=1024]=`STENCIL`,e[e.DEPTH=256]=`DEPTH`,e[e.COLOR_DEPTH=16640]=`COLOR_DEPTH`,e[e.COLOR_STENCIL=17408]=`COLOR_STENCIL`,e[e.DEPTH_STENCIL=1280]=`DEPTH_STENCIL`,e[e.ALL=17664]=`ALL`,e))(D||{}),O=class{constructor(e){this.items=[],this._name=e}emit(e,t,n,r,i,a,o,s){let{name:c,items:l}=this;for(let u=0,d=l.length;u<d;u++)l[u][c](e,t,n,r,i,a,o,s);return this}add(e){return e[this._name]&&(this.remove(e),this.items.push(e)),this}remove(e){let t=this.items.indexOf(e);return t!==-1&&this.items.splice(t,1),this}contains(e){return this.items.indexOf(e)!==-1}removeAll(){return this.items.length=0,this}destroy(){this.removeAll(),this.items=null,this._name=null}get empty(){return this.items.length===0}get name(){return this._name}},ve=[`init`,`destroy`,`contextChange`,`resolutionChange`,`reset`,`renderEnd`,`renderStart`,`render`,`update`,`postrender`,`prerender`],k=class e extends ae{constructor(e){super(),this.runners=Object.create(null),this.renderPipes=Object.create(null),this._initOptions={},this._systemsHash=Object.create(null),this.type=e.type,this.name=e.name,this.config=e;let t=[...ve,...this.config.runners??[]];this._addRunners(...t),this._unsafeEvalCheck()}async init(t={}){await ge(t.skipExtensionImports===!0||t.manageImports===!1),this._addSystems(this.config.systems),this._addPipes(this.config.renderPipes,this.config.renderPipeAdaptors);for(let e in this._systemsHash)t={...this._systemsHash[e].constructor.defaultOptions,...t};t={...e.defaultOptions,...t},this._roundPixels=+!!t.roundPixels;for(let e=0;e<this.runners.init.items.length;e++)await this.runners.init.items[e].init(t);this._initOptions=t}render(e,t){let r=e;if(r instanceof n&&(r={container:r},t&&(ne(le,`passing a second argument is deprecated, please use render options instead`),r.target=t.renderTexture)),r.target||(r.target=this.view.renderTarget),r.target===this.view.renderTarget&&(this._lastObjectRendered=r.container,r.clearColor=this.background.colorRgba),r.clearColor){let e=Array.isArray(r.clearColor)&&r.clearColor.length===4;r.clearColor=e?r.clearColor:p.shared.setValue(r.clearColor).toArray()}r.transform||(r.container.updateLocalTransform(),r.transform=r.container.localTransform),this.runners.prerender.emit(r),this.runners.renderStart.emit(r),this.runners.render.emit(r),this.runners.renderEnd.emit(r),this.runners.postrender.emit(r)}resize(e,t,n){let r=this.view.resolution;this.view.resize(e,t,n),this.emit(`resize`,this.view.screen.width,this.view.screen.height,this.view.resolution),n!==void 0&&n!==r&&this.runners.resolutionChange.emit(n)}clear(e={}){let t=this;e.target||=t.renderTarget.renderTarget,e.clearColor||=this.background.colorRgba,e.clear??=D.ALL;let{clear:n,clearColor:r,target:i}=e;p.shared.setValue(r??this.background.colorRgba),t.renderTarget.clear(i,n,p.shared.toArray())}get resolution(){return this.view.resolution}set resolution(e){this.view.resolution=e,this.runners.resolutionChange.emit(e)}get width(){return this.view.texture.frame.width}get height(){return this.view.texture.frame.height}get canvas(){return this.view.canvas}get lastObjectRendered(){return this._lastObjectRendered}get renderingToScreen(){return this.renderTarget.renderingToScreen}get screen(){return this.view.screen}_addRunners(...e){e.forEach(e=>{this.runners[e]=new O(e)})}_addSystems(e){let t;for(t in e){let n=e[t];this._addSystem(n.value,n.name)}}_addSystem(e,t){let n=new e(this);if(this[t])throw Error(`Whoops! The name "${t}" is already in use`);this[t]=n,this._systemsHash[t]=n;for(let e in this.runners)this.runners[e].add(n);return this}_addPipes(e,t){let n=t.reduce((e,t)=>(e[t.name]=t.value,e),{});e.forEach(e=>{let t=e.value,r=e.name,i=n[r];this.renderPipes[r]=new t(this,i?new i:null)})}destroy(e=!1){this.runners.destroy.items.reverse(),this.runners.destroy.emit(e),Object.values(this.runners).forEach(e=>{e.destroy()}),this._systemsHash=null,this.renderPipes=null}generateTexture(e){return this.textureGenerator.generateTexture(e)}get roundPixels(){return!!this._roundPixels}_unsafeEvalCheck(){if(!_e())throw Error(`Current environment does not allow unsafe-eval, please use pixi.js/unsafe-eval module to enable support.`)}};k.defaultOptions={resolution:1,failIfMajorPerformanceCaveat:!1,roundPixels:!1};var ye=k,A=`8.5.2`,j=class{static init(){globalThis.__PIXI_APP_INIT__?.(this,A)}static destroy(){}};j.extension=b.Application;var M=class{constructor(e){this._renderer=e}init(){globalThis.__PIXI_RENDERER_INIT__?.(this._renderer,A)}destroy(){this._renderer=null}};M.extension={type:[b.WebGLSystem,b.WebGPUSystem],name:`initHook`,priority:-10};var be=`in vec2 vMaskCoord;
in vec2 vTextureCoord;

uniform sampler2D uTexture;
uniform sampler2D uMaskTexture;

uniform float uAlpha;
uniform vec4 uMaskClamp;
uniform float uInverse;

out vec4 finalColor;

void main(void)
{
    float clip = step(3.5,
        step(uMaskClamp.x, vMaskCoord.x) +
        step(uMaskClamp.y, vMaskCoord.y) +
        step(vMaskCoord.x, uMaskClamp.z) +
        step(vMaskCoord.y, uMaskClamp.w));

    // TODO look into why this is needed
    float npmAlpha = uAlpha;
    vec4 original = texture(uTexture, vTextureCoord);
    vec4 masky = texture(uMaskTexture, vMaskCoord);
    float alphaMul = 1.0 - npmAlpha * (1.0 - masky.a);

    float a = alphaMul * masky.r * npmAlpha * clip;

    if (uInverse == 1.0) {
        a = 1.0 - a;
    }

    finalColor = original * a;
}
`,xe=`in vec2 aPosition;

out vec2 vTextureCoord;
out vec2 vMaskCoord;


uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uFilterMatrix;

vec4 filterVertexPosition(  vec2 aPosition )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
       
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(  vec2 aPosition )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

vec2 getFilterCoord( vec2 aPosition )
{
    return  ( uFilterMatrix * vec3( filterTextureCoord(aPosition), 1.0)  ).xy;
}   

void main(void)
{
    gl_Position = filterVertexPosition(aPosition);
    vTextureCoord = filterTextureCoord(aPosition);
    vMaskCoord = getFilterCoord(aPosition);
}
`,N=`struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

struct MaskUniforms {
  uFilterMatrix:mat3x3<f32>,
  uMaskClamp:vec4<f32>,
  uAlpha:f32,
  uInverse:f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;

@group(1) @binding(0) var<uniform> filterUniforms : MaskUniforms;
@group(1) @binding(1) var uMaskTexture: texture_2d<f32>;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv : vec2<f32>,
    @location(1) filterUv : vec2<f32>,
};

fn filterVertexPosition(aPosition:vec2<f32>) -> vec4<f32>
{
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;

    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

fn filterTextureCoord( aPosition:vec2<f32> ) -> vec2<f32>
{
    return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

fn globalTextureCoord( aPosition:vec2<f32> ) -> vec2<f32>
{
  return  (aPosition.xy / gfu.uGlobalFrame.zw) + (gfu.uGlobalFrame.xy / gfu.uGlobalFrame.zw);
}

fn getFilterCoord(aPosition:vec2<f32> ) -> vec2<f32>
{
  return ( filterUniforms.uFilterMatrix * vec3( filterTextureCoord(aPosition), 1.0)  ).xy;
}

fn getSize() -> vec2<f32>
{
  return gfu.uGlobalFrame.zw;
}

@vertex
fn mainVertex(
  @location(0) aPosition : vec2<f32>,
) -> VSOutput {
  return VSOutput(
   filterVertexPosition(aPosition),
   filterTextureCoord(aPosition),
   getFilterCoord(aPosition)
  );
}

@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>,
  @location(1) filterUv: vec2<f32>,
  @builtin(position) position: vec4<f32>
) -> @location(0) vec4<f32> {

    var maskClamp = filterUniforms.uMaskClamp;
    var uAlpha = filterUniforms.uAlpha;

    var clip = step(3.5,
      step(maskClamp.x, filterUv.x) +
      step(maskClamp.y, filterUv.y) +
      step(filterUv.x, maskClamp.z) +
      step(filterUv.y, maskClamp.w));

    var mask = textureSample(uMaskTexture, uSampler, filterUv);
    var source = textureSample(uTexture, uSampler, uv);
    var alphaMul = 1.0 - uAlpha * (1.0 - mask.a);

    var a: f32 = alphaMul * mask.r * uAlpha * clip;

    if (filterUniforms.uInverse == 1.0) {
        a = 1.0 - a;
    }

    return source * a;
}
`,Se=class extends he{constructor(e){let{sprite:n,...r}=e,i=new ie(n.texture),a=new v({uFilterMatrix:{value:new S,type:`mat3x3<f32>`},uMaskClamp:{value:i.uClampFrame,type:`vec4<f32>`},uAlpha:{value:1,type:`f32`},uInverse:{value:+!!e.inverse,type:`f32`}}),o=t.from({vertex:{source:N,entryPoint:`mainVertex`},fragment:{source:N,entryPoint:`mainFragment`}}),s=c.from({vertex:xe,fragment:be,name:`mask-filter`});super({...r,gpuProgram:o,glProgram:s,resources:{filterUniforms:a,uMaskTexture:n.texture.source}}),this.sprite=n,this._textureMatrix=i}set inverse(e){this.resources.filterUniforms.uniforms.uInverse=+!!e}get inverse(){return this.resources.filterUniforms.uniforms.uInverse===1}apply(e,t,n,r){this._textureMatrix.texture=this.sprite.texture,e.calculateSpriteMatrix(this.resources.filterUniforms.uniforms.uFilterMatrix,this.sprite).prepend(this._textureMatrix.mapCoord),this.resources.uMaskTexture=this.sprite.texture.source,e.applyFilter(this,t,n,r)}},P=class e{constructor(e,t){this.state=ee.for2d(),this._batchersByInstructionSet=Object.create(null),this._activeBatches=Object.create(null),this.renderer=e,this._adaptor=t,this._adaptor.init?.(this)}static getBatcher(e){return new this._availableBatchers[e]}buildStart(e){let t=this._batchersByInstructionSet[e.uid];t||(t=this._batchersByInstructionSet[e.uid]=Object.create(null),t.default||(t.default=new de)),this._activeBatches=t,this._activeBatch=this._activeBatches.default;for(let e in this._activeBatches)this._activeBatches[e].begin()}addToBatch(t,n){if(this._activeBatch.name!==t.batcherName){this._activeBatch.break(n);let r=this._activeBatches[t.batcherName];r||(r=this._activeBatches[t.batcherName]=e.getBatcher(t.batcherName),r.begin()),this._activeBatch=r}this._activeBatch.add(t)}break(e){this._activeBatch.break(e)}buildEnd(e){this._activeBatch.break(e);let t=this._activeBatches;for(let e in t){let n=t[e],r=n.geometry;r.indexBuffer.setDataWithSize(n.indexBuffer,n.indexSize,!0),r.buffers[0].setDataWithSize(n.attributeBuffer.float32View,n.attributeSize,!1)}}upload(e){let t=this._batchersByInstructionSet[e.uid];for(let e in t){let n=t[e],r=n.geometry;n.dirty&&(n.dirty=!1,r.buffers[0].update(n.attributeSize*4))}}execute(e){if(e.action===`startBatch`){let t=e.batcher,n=t.geometry,r=t.shader;this._adaptor.start(this,n,r)}this._adaptor.execute(this,e)}destroy(){this.state=null,this.renderer=null,this._adaptor=null;for(let e in this._activeBatches)this._activeBatches[e].destroy();this._activeBatches=null}};P.extension={type:[b.WebGLPipes,b.WebGPUPipes,b.CanvasPipes],name:`batch`},P._availableBatchers=Object.create(null);var F=P;_.handleByMap(b.Batcher,F._availableBatchers),_.add(de);var Ce={name:`texture-bit`,vertex:{header:`

        struct TextureUniforms {
            uTextureMatrix:mat3x3<f32>,
        }

        @group(2) @binding(2) var<uniform> textureUniforms : TextureUniforms;
        `,main:`
            uv = (textureUniforms.uTextureMatrix * vec3(uv, 1.0)).xy;
        `},fragment:{header:`
            @group(2) @binding(0) var uTexture: texture_2d<f32>;
            @group(2) @binding(1) var uSampler: sampler;

         
        `,main:`
            outColor = textureSample(uTexture, uSampler, vUV);
        `}},we={name:`texture-bit`,vertex:{header:`
            uniform mat3 uTextureMatrix;
        `,main:`
            uv = (uTextureMatrix * vec3(uv, 1.0)).xy;
        `},fragment:{header:`
        uniform sampler2D uTexture;

         
        `,main:`
            outColor = texture(uTexture, vUV);
        `}};function Te(e,t){let n=e.root,r=e.instructionSet;r.reset();let i=t.renderPipes?t:t.batch.renderer,a=i.renderPipes;a.batch.buildStart(r),a.blendMode.buildStart(),a.colorMask.buildStart(),n.sortableChildren&&n.sortChildren(),L(n,r,i,!0),a.batch.buildEnd(r),a.blendMode.buildEnd(r)}function I(e,t,n){let r=n.renderPipes?n:n.batch.renderer;e.globalDisplayStatus<7||!e.includeInBuild||(e.sortableChildren&&e.sortChildren(),e.isSimple?Ee(e,t,r):L(e,t,r,!1))}function Ee(e,t,n){if(e.renderPipeId){let r=e,{renderPipes:i,renderableGC:a}=n;i.blendMode.setBlendMode(r,e.groupBlendMode,t),i[r.renderPipeId].addRenderable(r,t),a.addRenderable(r,t),r.didViewUpdate=!1}if(!e.renderGroup){let r=e.children,i=r.length;for(let e=0;e<i;e++)I(r[e],t,n)}}function L(e,t,n,r){let{renderPipes:i,renderableGC:a}=n;if(!r&&e.renderGroup)i.renderGroup.addRenderGroup(e.renderGroup,t);else{for(let n=0;n<e.effects.length;n++){let r=e.effects[n];i[r.pipe].push(r,e,t)}let r=e,o=r.renderPipeId;o&&(i.blendMode.setBlendMode(r,r.groupBlendMode,t),i[o].addRenderable(r,t),a.addRenderable(r,t),r.didViewUpdate=!1);let s=e.children;if(s.length)for(let e=0;e<s.length;e++)I(s[e],t,n);for(let n=e.effects.length-1;n>=0;n--){let r=e.effects[n];i[r.pipe].pop(r,e,t)}}}var De=new h,Oe=class extends ue{constructor(){super(),this.filters=[new Se({sprite:new d(e.EMPTY),inverse:!1,resolution:`inherit`,antialias:`inherit`})]}get sprite(){return this.filters[0].sprite}set sprite(e){this.filters[0].sprite=e}get inverse(){return this.filters[0].inverse}set inverse(e){this.filters[0].inverse=e}},ke=class{constructor(e){this._activeMaskStage=[],this._renderer=e}push(e,t,n){let r=this._renderer;if(r.renderPipes.batch.break(n),n.add({renderPipeId:`alphaMask`,action:`pushMaskBegin`,mask:e,inverse:t._maskOptions.inverse,canBundle:!1,maskedContainer:t}),e.inverse=t._maskOptions.inverse,e.renderMaskToTexture){let t=e.mask;t.includeInBuild=!0,I(t,n,r),t.includeInBuild=!1}r.renderPipes.batch.break(n),n.add({renderPipeId:`alphaMask`,action:`pushMaskEnd`,mask:e,maskedContainer:t,inverse:t._maskOptions.inverse,canBundle:!1})}pop(e,t,n){this._renderer.renderPipes.batch.break(n),n.add({renderPipeId:`alphaMask`,action:`popMaskEnd`,mask:e,inverse:t._maskOptions.inverse,canBundle:!1})}execute(e){let t=this._renderer,n=e.mask.renderMaskToTexture;if(e.action===`pushMaskBegin`){let r=m.get(Oe);if(r.inverse=e.inverse,n){e.mask.mask.measurable=!0;let n=te(e.mask.mask,!0,De);e.mask.mask.measurable=!1,n.ceil();let i=t.renderTarget.renderTarget.colorTexture.source,a=ce.getOptimalTexture(n.width,n.height,i._resolution,i.antialias);t.renderTarget.push(a,!0),t.globalUniforms.push({offset:n,worldColor:4294967295});let o=r.sprite;o.texture=a,o.worldTransform.tx=n.minX,o.worldTransform.ty=n.minY,this._activeMaskStage.push({filterEffect:r,maskedContainer:e.maskedContainer,filterTexture:a})}else r.sprite=e.mask.mask,this._activeMaskStage.push({filterEffect:r,maskedContainer:e.maskedContainer})}else if(e.action===`pushMaskEnd`){let e=this._activeMaskStage[this._activeMaskStage.length-1];n&&(t.type===r.WEBGL&&t.renderTarget.finishRenderPass(),t.renderTarget.pop(),t.globalUniforms.pop()),t.filter.push({renderPipeId:`filter`,action:`pushFilter`,container:e.maskedContainer,filterEffect:e.filterEffect,canBundle:!1})}else if(e.action===`popMaskEnd`){t.filter.pop();let e=this._activeMaskStage.pop();n&&ce.returnTexture(e.filterTexture),m.return(e.filterEffect)}}destroy(){this._renderer=null,this._activeMaskStage=null}};ke.extension={type:[b.WebGLPipes,b.WebGPUPipes,b.CanvasPipes],name:`alphaMask`};var Ae=class{constructor(e){this._colorStack=[],this._colorStackIndex=0,this._currentColor=0,this._renderer=e}buildStart(){this._colorStack[0]=15,this._colorStackIndex=1,this._currentColor=15}push(e,t,n){this._renderer.renderPipes.batch.break(n);let r=this._colorStack;r[this._colorStackIndex]=r[this._colorStackIndex-1]&e.mask;let i=this._colorStack[this._colorStackIndex];i!==this._currentColor&&(this._currentColor=i,n.add({renderPipeId:`colorMask`,colorMask:i,canBundle:!1})),this._colorStackIndex++}pop(e,t,n){this._renderer.renderPipes.batch.break(n);let r=this._colorStack;this._colorStackIndex--;let i=r[this._colorStackIndex-1];i!==this._currentColor&&(this._currentColor=i,n.add({renderPipeId:`colorMask`,colorMask:i,canBundle:!1}))}execute(e){this._renderer.colorMask.setMask(e.colorMask)}destroy(){this._colorStack=null}};Ae.extension={type:[b.WebGLPipes,b.WebGPUPipes,b.CanvasPipes],name:`colorMask`};var je=class{constructor(e){this._maskStackHash={},this._maskHash=new WeakMap,this._renderer=e}push(e,t,n){var r;let i=e,a=this._renderer;a.renderPipes.batch.break(n),a.renderPipes.blendMode.setBlendMode(i.mask,`none`,n),n.add({renderPipeId:`stencilMask`,action:`pushMaskBegin`,mask:e,inverse:t._maskOptions.inverse,canBundle:!1});let o=i.mask;o.includeInBuild=!0,this._maskHash.has(i)||this._maskHash.set(i,{instructionsStart:0,instructionsLength:0});let s=this._maskHash.get(i);s.instructionsStart=n.instructionSize,I(o,n,a),o.includeInBuild=!1,a.renderPipes.batch.break(n),n.add({renderPipeId:`stencilMask`,action:`pushMaskEnd`,mask:e,inverse:t._maskOptions.inverse,canBundle:!1}),s.instructionsLength=n.instructionSize-s.instructionsStart-1;let c=a.renderTarget.renderTarget.uid;(r=this._maskStackHash)[c]??(r[c]=0)}pop(e,t,n){let r=e,i=this._renderer;i.renderPipes.batch.break(n),i.renderPipes.blendMode.setBlendMode(r.mask,`none`,n),n.add({renderPipeId:`stencilMask`,action:`popMaskBegin`,inverse:t._maskOptions.inverse,canBundle:!1});let a=this._maskHash.get(e);for(let e=0;e<a.instructionsLength;e++)n.instructions[n.instructionSize++]=n.instructions[a.instructionsStart++];n.add({renderPipeId:`stencilMask`,action:`popMaskEnd`,canBundle:!1})}execute(e){var t;let n=this._renderer,r=n.renderTarget.renderTarget.uid,i=(t=this._maskStackHash)[r]??(t[r]=0);e.action===`pushMaskBegin`?(n.renderTarget.ensureDepthStencil(),n.stencil.setStencilMode(C.RENDERING_MASK_ADD,i),i++,n.colorMask.setMask(0)):e.action===`pushMaskEnd`?(e.inverse?n.stencil.setStencilMode(C.INVERSE_MASK_ACTIVE,i):n.stencil.setStencilMode(C.MASK_ACTIVE,i),n.colorMask.setMask(15)):e.action===`popMaskBegin`?(n.colorMask.setMask(0),i===0?(n.renderTarget.clear(null,D.STENCIL),n.stencil.setStencilMode(C.DISABLED,i)):n.stencil.setStencilMode(C.RENDERING_MASK_REMOVE,i),i--):e.action===`popMaskEnd`&&(e.inverse?n.stencil.setStencilMode(C.INVERSE_MASK_ACTIVE,i):n.stencil.setStencilMode(C.MASK_ACTIVE,i),n.colorMask.setMask(15)),this._maskStackHash[r]=i}destroy(){this._renderer=null,this._maskStackHash=null,this._maskHash=null}};je.extension={type:[b.WebGLPipes,b.WebGPUPipes,b.CanvasPipes],name:`stencilMask`};function Me(e,t){for(let n in e.attributes){let r=e.attributes[n],i=t[n];i?(r.format??=i.format,r.offset??=i.offset,r.instance??=i.instance):f(`Attribute ${n} is not present in the shader, but is present in the geometry. Unable to infer attribute details.`)}Ne(e)}function Ne(e){let{buffers:t,attributes:n}=e,r={},i={};for(let e in t){let n=t[e];r[n.uid]=0,i[n.uid]=0}for(let e in n){let t=n[e];r[t.buffer.uid]+=oe(t.format).stride}for(let e in n){let t=n[e];t.stride??=r[t.buffer.uid],t.start??=i[t.buffer.uid],i[t.buffer.uid]+=oe(t.format).stride}}var R=[];R[C.NONE]=void 0,R[C.DISABLED]={stencilWriteMask:0,stencilReadMask:0},R[C.RENDERING_MASK_ADD]={stencilFront:{compare:`equal`,passOp:`increment-clamp`},stencilBack:{compare:`equal`,passOp:`increment-clamp`}},R[C.RENDERING_MASK_REMOVE]={stencilFront:{compare:`equal`,passOp:`decrement-clamp`},stencilBack:{compare:`equal`,passOp:`decrement-clamp`}},R[C.MASK_ACTIVE]={stencilWriteMask:0,stencilFront:{compare:`equal`,passOp:`keep`},stencilBack:{compare:`equal`,passOp:`keep`}},R[C.INVERSE_MASK_ACTIVE]={stencilWriteMask:0,stencilFront:{compare:`not-equal`,passOp:`replace`},stencilBack:{compare:`not-equal`,passOp:`replace`}};var Pe=class{constructor(e){this._syncFunctionHash=Object.create(null),this._adaptor=e,this._systemCheck()}_systemCheck(){if(!_e())throw Error(`Current environment does not allow unsafe-eval, please use pixi.js/unsafe-eval module to enable support.`)}ensureUniformGroup(e){let t=this.getUniformGroupData(e);e.buffer||=new pe({data:new Float32Array(t.layout.size/4),usage:w.UNIFORM|w.COPY_DST})}getUniformGroupData(e){return this._syncFunctionHash[e._signature]||this._initUniformGroup(e)}_initUniformGroup(e){let t=e._signature,n=this._syncFunctionHash[t];if(!n){let r=Object.keys(e.uniformStructures).map(t=>e.uniformStructures[t]),i=this._adaptor.createUboElements(r),a=this._generateUboSync(i.uboElements);n=this._syncFunctionHash[t]={layout:i,syncFunction:a}}return this._syncFunctionHash[t]}_generateUboSync(e){return this._adaptor.generateUboSync(e)}syncUniformGroup(e,t,n){let r=this.getUniformGroupData(e);return e.buffer||=new pe({data:new Float32Array(r.layout.size/4),usage:w.UNIFORM|w.COPY_DST}),t||=e.buffer.data,n||=0,r.syncFunction(e.uniforms,t,n),!0}updateUniformGroup(e){if(e.isStatic&&!e._dirtyId)return!1;e._dirtyId=0;let t=this.syncUniformGroup(e);return e.buffer.update(),t}destroy(){this._syncFunctionHash=null}},z=[{type:`mat3x3<f32>`,test:e=>e.value.a!==void 0,ubo:`
            var matrix = uv[name].toArray(true);
            data[offset] = matrix[0];
            data[offset + 1] = matrix[1];
            data[offset + 2] = matrix[2];
            data[offset + 4] = matrix[3];
            data[offset + 5] = matrix[4];
            data[offset + 6] = matrix[5];
            data[offset + 8] = matrix[6];
            data[offset + 9] = matrix[7];
            data[offset + 10] = matrix[8];
        `,uniform:`
            gl.uniformMatrix3fv(ud[name].location, false, uv[name].toArray(true));
        `},{type:`vec4<f32>`,test:e=>e.type===`vec4<f32>`&&e.size===1&&e.value.width!==void 0,ubo:`
            v = uv[name];
            data[offset] = v.x;
            data[offset + 1] = v.y;
            data[offset + 2] = v.width;
            data[offset + 3] = v.height;
        `,uniform:`
            cv = ud[name].value;
            v = uv[name];
            if (cv[0] !== v.x || cv[1] !== v.y || cv[2] !== v.width || cv[3] !== v.height) {
                cv[0] = v.x;
                cv[1] = v.y;
                cv[2] = v.width;
                cv[3] = v.height;
                gl.uniform4f(ud[name].location, v.x, v.y, v.width, v.height);
            }
        `},{type:`vec2<f32>`,test:e=>e.type===`vec2<f32>`&&e.size===1&&e.value.x!==void 0,ubo:`
            v = uv[name];
            data[offset] = v.x;
            data[offset + 1] = v.y;
        `,uniform:`
            cv = ud[name].value;
            v = uv[name];
            if (cv[0] !== v.x || cv[1] !== v.y) {
                cv[0] = v.x;
                cv[1] = v.y;
                gl.uniform2f(ud[name].location, v.x, v.y);
            }
        `},{type:`vec4<f32>`,test:e=>e.type===`vec4<f32>`&&e.size===1&&e.value.red!==void 0,ubo:`
            v = uv[name];
            data[offset] = v.red;
            data[offset + 1] = v.green;
            data[offset + 2] = v.blue;
            data[offset + 3] = v.alpha;
        `,uniform:`
            cv = ud[name].value;
            v = uv[name];
            if (cv[0] !== v.red || cv[1] !== v.green || cv[2] !== v.blue || cv[3] !== v.alpha) {
                cv[0] = v.red;
                cv[1] = v.green;
                cv[2] = v.blue;
                cv[3] = v.alpha;
                gl.uniform4f(ud[name].location, v.red, v.green, v.blue, v.alpha);
            }
        `},{type:`vec3<f32>`,test:e=>e.type===`vec3<f32>`&&e.size===1&&e.value.red!==void 0,ubo:`
            v = uv[name];
            data[offset] = v.red;
            data[offset + 1] = v.green;
            data[offset + 2] = v.blue;
        `,uniform:`
            cv = ud[name].value;
            v = uv[name];
            if (cv[0] !== v.red || cv[1] !== v.green || cv[2] !== v.blue) {
                cv[0] = v.red;
                cv[1] = v.green;
                cv[2] = v.blue;
                gl.uniform3f(ud[name].location, v.red, v.green, v.blue);
            }
        `}];function Fe(e,t,n,r){let i=[`
        var v = null;
        var v2 = null;
        var t = 0;
        var index = 0;
        var name = null;
        var arrayOffset = null;
    `],a=0;for(let o=0;o<e.length;o++){let s=e[o],c=s.data.name,l=!1,u=0;for(let e=0;e<z.length;e++)if(z[e].test(s.data)){u=s.offset/4,i.push(`name = "${c}";`,`offset += ${u-a};`,z[e][t]||z[e].ubo),l=!0;break}if(!l){if(s.data.size>1)u=s.offset/4,i.push(n(s,u-a));else{let e=r[s.data.type];u=s.offset/4,i.push(`
                    v = uv.${c};
                    offset += ${u-a};
                    ${e};
                `)}}a=u}let o=i.join(`
`);return Function(`uv`,`data`,`offset`,o)}function B(e,t){return`
        for (let i = 0; i < ${e*t}; i++) {
            data[offset + (((i / ${e})|0) * 4) + (i % ${e})] = v[i];
        }
    `}var Ie={f32:`
        data[offset] = v;`,i32:`
        data[offset] = v;`,"vec2<f32>":`
        data[offset] = v[0];
        data[offset + 1] = v[1];`,"vec3<f32>":`
        data[offset] = v[0];
        data[offset + 1] = v[1];
        data[offset + 2] = v[2];`,"vec4<f32>":`
        data[offset] = v[0];
        data[offset + 1] = v[1];
        data[offset + 2] = v[2];
        data[offset + 3] = v[3];`,"mat2x2<f32>":`
        data[offset] = v[0];
        data[offset + 1] = v[1];
        data[offset + 4] = v[2];
        data[offset + 5] = v[3];`,"mat3x3<f32>":`
        data[offset] = v[0];
        data[offset + 1] = v[1];
        data[offset + 2] = v[2];
        data[offset + 4] = v[3];
        data[offset + 5] = v[4];
        data[offset + 6] = v[5];
        data[offset + 8] = v[6];
        data[offset + 9] = v[7];
        data[offset + 10] = v[8];`,"mat4x4<f32>":`
        for (let i = 0; i < 16; i++) {
            data[offset + i] = v[i];
        }`,"mat3x2<f32>":B(3,2),"mat4x2<f32>":B(4,2),"mat2x3<f32>":B(2,3),"mat4x3<f32>":B(4,3),"mat2x4<f32>":B(2,4),"mat3x4<f32>":B(3,4)},Le={...Ie,"mat2x2<f32>":`
        data[offset] = v[0];
        data[offset + 1] = v[1];
        data[offset + 2] = v[2];
        data[offset + 3] = v[3];
    `};function Re(e,t,n,r,i,a){let o=a?1:-1;return e.identity(),e.a=1/r*2,e.d=o*(1/i*2),e.tx=-1-t*e.a,e.ty=-o-n*e.d,e}var V=new Map;function ze(t,n){if(!V.has(t)){let r=new e({source:new o({resource:t,...n})}),i=()=>{V.get(t)===r&&V.delete(t)};r.once(`destroy`,i),r.source.once(`destroy`,i),V.set(t,r)}return V.get(t)}function Be(e){let t=e.colorTexture.source.resource;return globalThis.HTMLCanvasElement&&t instanceof HTMLCanvasElement&&document.body.contains(t)}var Ve=class t{constructor(n={}){if(this.uid=g(`renderTarget`),this.colorTextures=[],this.dirtyId=0,this.isRoot=!1,this._size=new Float32Array(2),this._managedColorTextures=!1,n={...t.defaultOptions,...n},this.stencil=n.stencil,this.depth=n.depth,this.isRoot=n.isRoot,typeof n.colorTextures==`number`){this._managedColorTextures=!0;for(let e=0;e<n.colorTextures;e++)this.colorTextures.push(new x({width:n.width,height:n.height,resolution:n.resolution,antialias:n.antialias}))}else{this.colorTextures=[...n.colorTextures.map(e=>e.source)];let e=this.colorTexture.source;this.resize(e.width,e.height,e._resolution)}this.colorTexture.source.on(`resize`,this.onSourceResize,this),(n.depthStencilTexture||this.stencil)&&(n.depthStencilTexture instanceof e||n.depthStencilTexture instanceof x?this.depthStencilTexture=n.depthStencilTexture.source:this.ensureDepthStencilTexture())}get size(){let e=this._size;return e[0]=this.pixelWidth,e[1]=this.pixelHeight,e}get width(){return this.colorTexture.source.width}get height(){return this.colorTexture.source.height}get pixelWidth(){return this.colorTexture.source.pixelWidth}get pixelHeight(){return this.colorTexture.source.pixelHeight}get resolution(){return this.colorTexture.source._resolution}get colorTexture(){return this.colorTextures[0]}onSourceResize(e){this.resize(e.width,e.height,e._resolution,!0)}ensureDepthStencilTexture(){this.depthStencilTexture||=new x({width:this.width,height:this.height,resolution:this.resolution,format:`depth24plus-stencil8`,autoGenerateMipmaps:!1,antialias:!1,mipLevelCount:1})}resize(e,t,n=this.resolution,r=!1){this.dirtyId++,this.colorTextures.forEach((i,a)=>{r&&a===0||i.source.resize(e,t,n)}),this.depthStencilTexture&&this.depthStencilTexture.source.resize(e,t,n)}destroy(){this.colorTexture.source.off(`resize`,this.onSourceResize,this),this._managedColorTextures&&this.colorTextures.forEach(e=>{e.destroy()}),this.depthStencilTexture&&(this.depthStencilTexture.destroy(),delete this.depthStencilTexture)}};Ve.defaultOptions={width:0,height:0,resolution:1,colorTextures:1,stencil:!1,depth:!1,antialias:!1,isRoot:!1};var H=Ve,He=class{constructor(e){this.rootViewPort=new y,this.viewport=new y,this.onRenderTargetChange=new O(`onRenderTargetChange`),this.projectionMatrix=new S,this.defaultClearColor=[0,0,0,0],this._renderSurfaceToRenderTargetHash=new Map,this._gpuRenderTargetHash=Object.create(null),this._renderTargetStack=[],this._renderer=e,e.renderableGC.addManagedHash(this,`_gpuRenderTargetHash`)}finishRenderPass(){this.adaptor.finishRenderPass(this.renderTarget)}renderStart({target:e,clear:t,clearColor:n,frame:r}){this._renderTargetStack.length=0,this.push(e,t,n,r),this.rootViewPort.copyFrom(this.viewport),this.rootRenderTarget=this.renderTarget,this.renderingToScreen=Be(this.rootRenderTarget)}postrender(){this.adaptor.postrender?.(this.rootRenderTarget)}bind(t,n=!0,r,i){let a=this.getRenderTarget(t),o=this.renderTarget!==a;this.renderTarget=a,this.renderSurface=t;let s=this.getGpuRenderTarget(a);(a.pixelWidth!==s.width||a.pixelHeight!==s.height)&&(this.adaptor.resizeGpuRenderTarget(a),s.width=a.pixelWidth,s.height=a.pixelHeight);let c=a.colorTexture,l=this.viewport,u=c.pixelWidth,d=c.pixelHeight;if(!i&&t instanceof e&&(i=t.frame),i){let e=c._resolution;l.x=i.x*e+.5|0,l.y=i.y*e+.5|0,l.width=i.width*e+.5|0,l.height=i.height*e+.5|0}else l.x=0,l.y=0,l.width=u,l.height=d;return Re(this.projectionMatrix,0,0,l.width/c.resolution,l.height/c.resolution,!a.isRoot),this.adaptor.startRenderPass(a,n,r,l),o&&this.onRenderTargetChange.emit(a),a}clear(e,t=D.ALL,n){t&&(e&&=this.getRenderTarget(e),this.adaptor.clear(e||this.renderTarget,t,n,this.viewport))}contextChange(){this._gpuRenderTargetHash=Object.create(null)}push(e,t=D.ALL,n,r){let i=this.bind(e,t,n,r);return this._renderTargetStack.push({renderTarget:i,frame:r}),i}pop(){this._renderTargetStack.pop();let e=this._renderTargetStack[this._renderTargetStack.length-1];this.bind(e.renderTarget,!1,null,e.frame)}getRenderTarget(e){return e.isTexture&&(e=e.source),this._renderSurfaceToRenderTargetHash.get(e)??this._initRenderTarget(e)}copyToTexture(e,t,n,r,i){n.x<0&&(r.width+=n.x,i.x-=n.x,n.x=0),n.y<0&&(r.height+=n.y,i.y-=n.y,n.y=0);let{pixelWidth:a,pixelHeight:o}=e;return r.width=Math.min(r.width,a-n.x),r.height=Math.min(r.height,o-n.y),this.adaptor.copyToTexture(e,t,n,r,i)}ensureDepthStencil(){this.renderTarget.stencil||(this.renderTarget.stencil=!0,this.adaptor.startRenderPass(this.renderTarget,!1,null,this.viewport))}destroy(){this._renderer=null,this._renderSurfaceToRenderTargetHash.forEach((e,t)=>{e!==t&&e.destroy()}),this._renderSurfaceToRenderTargetHash.clear(),this._gpuRenderTargetHash=Object.create(null)}_initRenderTarget(e){let t=null;return o.test(e)&&(e=ze(e).source),e instanceof H?t=e:e instanceof x&&(t=new H({colorTextures:[e]}),o.test(e.source.resource)&&(t.isRoot=!0),e.once(`destroy`,()=>{t.destroy(),this._renderSurfaceToRenderTargetHash.delete(e);let n=this._gpuRenderTargetHash[t.uid];n&&(this._gpuRenderTargetHash[t.uid]=null,this.adaptor.destroyGpuRenderTarget(n))})),this._renderSurfaceToRenderTargetHash.set(e,t),t}getGpuRenderTarget(e){return this._gpuRenderTargetHash[e.uid]||(this._gpuRenderTargetHash[e.uid]=this.adaptor.initGpuRenderTarget(e))}},Ue=class extends ae{constructor({buffer:e,offset:t,size:n}){super(),this.uid=g(`buffer`),this._resourceType=`bufferResource`,this._touched=0,this._resourceId=g(`resource`),this._bufferResource=!0,this.destroyed=!1,this.buffer=e,this.offset=t|0,this.size=n,this.buffer.on(`change`,this.onBufferChange,this)}onBufferChange(){this._resourceId=g(`resource`),this.emit(`change`,this)}destroy(e=!1){this.destroyed=!0,e&&this.buffer.destroy(),this.emit(`change`,this),this.buffer=null}},We=class{constructor(e){this._renderer=e}updateRenderable(){}destroyRenderable(){}validateRenderable(){return!1}addRenderable(e,t){this._renderer.renderPipes.batch.break(t),t.add(e)}execute(e){e.isRenderable&&e.render(this._renderer)}destroy(){this._renderer=null}};We.extension={type:[b.WebGLPipes,b.WebGPUPipes,b.CanvasPipes],name:`customRender`};function Ge(e,t){let n=e.instructionSet,r=n.instructions;for(let e=0;e<n.instructionSize;e++){let n=r[e];t[n.renderPipeId].execute(n)}}var Ke=class{constructor(e){this._renderer=e}addRenderGroup(e,t){this._renderer.renderPipes.batch.break(t),t.add(e)}execute(e){e.isRenderable&&(this._renderer.globalUniforms.push({worldTransformMatrix:e.worldTransform,worldColor:e.worldColorAlpha}),Ge(e,this._renderer.renderPipes),this._renderer.globalUniforms.pop())}destroy(){this._renderer=null}};Ke.extension={type:[b.WebGLPipes,b.WebGPUPipes,b.CanvasPipes],name:`renderGroup`};function U(e,t){t||=0;for(let n=t;n<e.length&&e[n];n++)e[n]=null}function qe(e,t=[]){t.push(e);for(let n=0;n<e.renderGroupChildren.length;n++)qe(e.renderGroupChildren[n],t);return t}function Je(e,t,n){let r=e>>16&255,i=e>>8&255,a=e&255,o=t>>16&255,s=t>>8&255,c=t&255,l=r+(o-r)*n,u=i+(s-i)*n,d=a+(c-a)*n;return(l<<16)+(u<<8)+d}var W=16777215;function Ye(e,t){return e===W||t===W?e+t-W:Je(e,t,.5)}var Xe=new n,Ze=7;function Qe(e,t=!1){$e(e);let n=e.childrenToUpdate,r=e.updateTick++;for(let t in n){let i=Number(t),a=n[t],o=a.list,s=a.index;for(let t=0;t<s;t++){let n=o[t];n.parentRenderGroup===e&&n.relativeRenderGroupDepth===i&&et(n,r,0)}U(o,s),a.index=0}if(t)for(let n=0;n<e.renderGroupChildren.length;n++)Qe(e.renderGroupChildren[n],t)}function $e(e){let t=e.root,n;if(e.renderGroupParent){let r=e.renderGroupParent;e.worldTransform.appendFrom(t.relativeGroupTransform,r.worldTransform),e.worldColor=Ye(t.groupColor,r.worldColor),n=t.groupAlpha*r.worldAlpha}else e.worldTransform.copyFrom(t.localTransform),e.worldColor=t.localColor,n=t.localAlpha;n=n<0?0:n>1?1:n,e.worldAlpha=n,e.worldColorAlpha=e.worldColor+((n*255|0)<<24)}function et(e,t,n){if(t===e.updateTick)return;e.updateTick=t,e.didChange=!1;let r=e.localTransform;e.updateLocalTransform();let i=e.parent;if(i&&!i.renderGroup?(n|=e._updateFlags,e.relativeGroupTransform.appendFrom(r,i.relativeGroupTransform),n&Ze&&tt(e,i,n)):(n=e._updateFlags,e.relativeGroupTransform.copyFrom(r),n&Ze&&tt(e,Xe,n)),!e.renderGroup){let r=e.children,i=r.length;for(let e=0;e<i;e++)et(r[e],t,n);let a=e.parentRenderGroup,o=e;o.renderPipeId&&!a.structureDidChange&&a.updateRenderable(o)}}function tt(e,t,n){if(n&1){e.groupColor=Ye(e.localColor,t.groupColor);let n=e.localAlpha*t.groupAlpha;n=n<0?0:n>1?1:n,e.groupAlpha=n,e.groupColorAlpha=e.groupColor+((n*255|0)<<24)}n&2&&(e.groupBlendMode=e.localBlendMode===`inherit`?t.groupBlendMode:e.localBlendMode),n&4&&(e.globalDisplayStatus=e.localDisplayStatus&t.globalDisplayStatus),e._updateFlags=0}function nt(e,t){let{list:n,index:r}=e.childrenRenderablesToUpdate,i=!1;for(let e=0;e<r;e++){let r=n[e];if(i=t[r.renderPipeId].validateRenderable(r),i)break}return e.structureDidChange=i,i}var rt=new S,it=class{constructor(e){this._renderer=e}render({container:e,transform:t}){e.isRenderGroup=!0;let n=e.parent,r=e.renderGroup.renderGroupParent;e.parent=null,e.renderGroup.renderGroupParent=null;let i=this._renderer,a=qe(e.renderGroup,[]),o=rt;t&&(o=o.copyFrom(e.renderGroup.localTransform),e.renderGroup.localTransform.copyFrom(t));let s=i.renderPipes;for(let e=0;e<a.length;e++){let t=a[e];t.runOnRender(),t.instructionSet.renderPipes=s,t.structureDidChange?U(t.childrenRenderablesToUpdate.list,0):nt(t,s),Qe(t),t.structureDidChange?(t.structureDidChange=!1,Te(t,i)):at(t),t.childrenRenderablesToUpdate.index=0,i.renderPipes.batch.upload(t.instructionSet)}i.globalUniforms.start({worldTransformMatrix:t?e.renderGroup.localTransform:e.renderGroup.worldTransform,worldColor:e.renderGroup.worldColorAlpha}),Ge(e.renderGroup,s),s.uniformBatch&&s.uniformBatch.renderEnd(),t&&e.renderGroup.localTransform.copyFrom(o),e.parent=n,e.renderGroup.renderGroupParent=r}destroy(){this._renderer=null}};it.extension={type:[b.WebGLSystem,b.WebGPUSystem,b.CanvasSystem],name:`renderGroup`};function at(e){let{list:t,index:n}=e.childrenRenderablesToUpdate;for(let r=0;r<n;r++){let n=t[r];n.didViewUpdate&&e.updateRenderable(n)}U(t,n)}var ot=class{constructor(e){this._gpuSpriteHash=Object.create(null),this._destroyRenderableBound=this.destroyRenderable.bind(this),this._renderer=e,this._renderer.renderableGC.addManagedHash(this,`_gpuSpriteHash`)}addRenderable(e,t){let n=this._getGpuSprite(e);e.didViewUpdate&&this._updateBatchableSprite(e,n),this._renderer.renderPipes.batch.addToBatch(n,t)}updateRenderable(e){let t=this._gpuSpriteHash[e.uid];e.didViewUpdate&&this._updateBatchableSprite(e,t),t._batcher.updateElement(t)}validateRenderable(e){let t=e._texture,n=this._getGpuSprite(e);return n.texture._source!==t._source&&!n._batcher.checkAndUpdateTexture(n,t)}destroyRenderable(e){let t=this._gpuSpriteHash[e.uid];m.return(t),this._gpuSpriteHash[e.uid]=null,e.off(`destroyed`,this._destroyRenderableBound)}_updateBatchableSprite(e,t){t.bounds=e.bounds,t.texture=e._texture}_getGpuSprite(e){return this._gpuSpriteHash[e.uid]||this._initGPUSprite(e)}_initGPUSprite(e){let t=m.get(se);return t.renderable=e,t.transform=e.groupTransform,t.texture=e._texture,t.bounds=e.bounds,t.roundPixels=this._renderer._roundPixels|e._roundPixels,this._gpuSpriteHash[e.uid]=t,e.on(`destroyed`,this._destroyRenderableBound),t}destroy(){for(let e in this._gpuSpriteHash)m.return(this._gpuSpriteHash[e]);this._gpuSpriteHash=null,this._renderer=null}};ot.extension={type:[b.WebGLPipes,b.WebGPUPipes,b.CanvasPipes],name:`sprite`};var G=class e{constructor(){this.clearBeforeRender=!0,this._backgroundColor=new p(0),this.color=this._backgroundColor,this.alpha=1}init(t){t={...e.defaultOptions,...t},this.clearBeforeRender=t.clearBeforeRender,this.color=t.background||t.backgroundColor||this._backgroundColor,this.alpha=t.backgroundAlpha,this._backgroundColor.setAlpha(t.backgroundAlpha)}get color(){return this._backgroundColor}set color(e){this._backgroundColor.setValue(e)}get alpha(){return this._backgroundColor.alpha}set alpha(e){this._backgroundColor.setAlpha(e)}get colorRgba(){return this._backgroundColor.toArray()}destroy(){}};G.extension={type:[b.WebGLSystem,b.WebGPUSystem,b.CanvasSystem],name:`background`,priority:0},G.defaultOptions={backgroundAlpha:1,backgroundColor:0,clearBeforeRender:!0};var st=G,K={};_.handle(b.BlendMode,e=>{if(!e.name)throw Error(`BlendMode extension must have a name property`);K[e.name]=e.ref},e=>{delete K[e.name]});var ct=class{constructor(e){this._isAdvanced=!1,this._filterHash=Object.create(null),this._renderer=e}setBlendMode(e,t,n){if(this._activeBlendMode===t){this._isAdvanced&&this._renderableList.push(e);return}this._activeBlendMode=t,this._isAdvanced&&this._endAdvancedBlendMode(n),this._isAdvanced=!!K[t],this._isAdvanced&&(this._beginAdvancedBlendMode(n),this._renderableList.push(e))}_beginAdvancedBlendMode(e){this._renderer.renderPipes.batch.break(e);let t=this._activeBlendMode;if(!K[t]){f(`Unable to assign BlendMode: '${t}'. You may want to include: import 'pixi.js/advanced-blend-modes'`);return}let n=this._filterHash[t];n||(n=this._filterHash[t]=new ue,n.filters=[new K[t]]);let r={renderPipeId:`filter`,action:`pushFilter`,renderables:[],filterEffect:n,canBundle:!1};this._renderableList=r.renderables,e.add(r)}_endAdvancedBlendMode(e){this._renderableList=null,this._renderer.renderPipes.batch.break(e),e.add({renderPipeId:`filter`,action:`popFilter`,canBundle:!1})}buildStart(){this._isAdvanced=!1}buildEnd(e){this._isAdvanced&&this._endAdvancedBlendMode(e)}destroy(){this._renderer=null,this._renderableList=null;for(let e in this._filterHash)this._filterHash[e].destroy();this._filterHash=null}};ct.extension={type:[b.WebGLPipes,b.WebGPUPipes,b.CanvasPipes],name:`blendMode`};var q={png:`image/png`,jpg:`image/jpeg`,webp:`image/webp`},J=class t{constructor(e){this._renderer=e}_normalizeOptions(t,r={}){return t instanceof n||t instanceof e?{target:t,...r}:{...r,...t}}async image(e){let t=new Image;return t.src=await this.base64(e),t}async base64(e){e=this._normalizeOptions(e,t.defaultImageOptions);let{format:n,quality:r}=e,i=this.canvas(e);if(i.toBlob!==void 0)return new Promise((e,t)=>{i.toBlob(n=>{if(!n){t(Error(`ICanvas.toBlob failed!`));return}let r=new FileReader;r.onload=()=>e(r.result),r.onerror=t,r.readAsDataURL(n)},q[n],r)});if(i.toDataURL!==void 0)return i.toDataURL(q[n],r);if(i.convertToBlob!==void 0){let e=await i.convertToBlob({type:q[n],quality:r});return new Promise((t,n)=>{let r=new FileReader;r.onload=()=>t(r.result),r.onerror=n,r.readAsDataURL(e)})}throw Error(`Extract.base64() requires ICanvas.toDataURL, ICanvas.toBlob, or ICanvas.convertToBlob to be implemented`)}canvas(t){t=this._normalizeOptions(t);let n=t.target,r=this._renderer;if(n instanceof e)return r.texture.generateCanvas(n);let i=r.textureGenerator.generateTexture(t),a=r.texture.generateCanvas(i);return i.destroy(),a}pixels(t){t=this._normalizeOptions(t);let r=t.target,i=this._renderer,a=r instanceof e?r:i.textureGenerator.generateTexture(t),o=i.texture.getPixels(a);return r instanceof n&&a.destroy(),o}texture(t){return t=this._normalizeOptions(t),t.target instanceof e?t.target:this._renderer.textureGenerator.generateTexture(t)}download(e){e=this._normalizeOptions(e);let t=this.canvas(e),n=document.createElement(`a`);n.download=e.filename??`image.png`,n.href=t.toDataURL(`image/png`),document.body.appendChild(n),n.click(),document.body.removeChild(n)}log(e){let t=e.width??200;e=this._normalizeOptions(e);let n=this.canvas(e),r=n.toDataURL();console.log(`[Pixi Texture] ${n.width}px ${n.height}px`);let i=[`font-size: 1px;`,`padding: ${t}px 300px;`,`background: url(${r}) no-repeat;`,`background-size: contain;`].join(` `);console.log(`%c `,i)}destroy(){this._renderer=null}};J.extension={type:[b.WebGLSystem,b.WebGPUSystem],name:`extract`},J.defaultImageOptions={format:`png`,quality:1};var lt=J,ut=class t extends e{static create(e){return new t({source:new x(e)})}resize(e,t,n){return this.source.resize(e,t,n),this}},dt=new y,ft=new h,pt=[0,0,0,0],mt=class{constructor(e){this._renderer=e}generateTexture(e){e instanceof n&&(e={target:e,frame:void 0,textureSourceOptions:{},resolution:void 0});let t=e.resolution||this._renderer.resolution,r=e.antialias||this._renderer.view.antialias,i=e.target,o=e.clearColor;o=o?Array.isArray(o)&&o.length===4?o:p.shared.setValue(o).toArray():pt;let s=e.frame?.copyTo(dt)||a(i,ft).rectangle;s.width=Math.max(s.width,1/t)|0,s.height=Math.max(s.height,1/t)|0;let c=ut.create({...e.textureSourceOptions,width:s.width,height:s.height,resolution:t,antialias:r}),l=S.shared.translate(-s.x,-s.y);return this._renderer.render({container:i,transform:l,target:c,clearColor:o}),c.source.updateMipmaps(),c}destroy(){this._renderer=null}};mt.extension={type:[b.WebGLSystem,b.WebGPUSystem],name:`textureGenerator`};var ht=class{constructor(e){this._stackIndex=0,this._globalUniformDataStack=[],this._uniformsPool=[],this._activeUniforms=[],this._bindGroupPool=[],this._activeBindGroups=[],this._renderer=e}reset(){this._stackIndex=0;for(let e=0;e<this._activeUniforms.length;e++)this._uniformsPool.push(this._activeUniforms[e]);for(let e=0;e<this._activeBindGroups.length;e++)this._bindGroupPool.push(this._activeBindGroups[e]);this._activeUniforms.length=0,this._activeBindGroups.length=0}start(e){this.reset(),this.push(e)}bind({size:e,projectionMatrix:t,worldTransformMatrix:n,worldColor:r,offset:i}){let a=this._renderer.renderTarget.renderTarget,o=this._stackIndex?this._globalUniformDataStack[this._stackIndex-1]:{projectionData:a,worldTransformMatrix:new S,worldColor:4294967295,offset:new re},s={projectionMatrix:t||this._renderer.renderTarget.projectionMatrix,resolution:e||a.size,worldTransformMatrix:n||o.worldTransformMatrix,worldColor:r||o.worldColor,offset:i||o.offset,bindGroup:null},c=this._uniformsPool.pop()||this._createUniforms();this._activeUniforms.push(c);let u=c.uniforms;u.uProjectionMatrix=s.projectionMatrix,u.uResolution=s.resolution,u.uWorldTransformMatrix.copyFrom(s.worldTransformMatrix),u.uWorldTransformMatrix.tx-=s.offset.x,u.uWorldTransformMatrix.ty-=s.offset.y,fe(s.worldColor,u.uWorldColorAlpha,0),c.update();let d;this._renderer.renderPipes.uniformBatch?d=this._renderer.renderPipes.uniformBatch.getUniformBindGroup(c,!1):(d=this._bindGroupPool.pop()||new l,this._activeBindGroups.push(d),d.setResource(c,0)),s.bindGroup=d,this._currentGlobalUniformData=s}push(e){this.bind(e),this._globalUniformDataStack[this._stackIndex++]=this._currentGlobalUniformData}pop(){this._currentGlobalUniformData=this._globalUniformDataStack[--this._stackIndex-1],this._renderer.type===r.WEBGL&&this._currentGlobalUniformData.bindGroup.resources[0].update()}get bindGroup(){return this._currentGlobalUniformData.bindGroup}get globalUniformData(){return this._currentGlobalUniformData}get uniformGroup(){return this._currentGlobalUniformData.bindGroup.resources[0]}_createUniforms(){return new v({uProjectionMatrix:{value:new S,type:`mat3x3<f32>`},uWorldTransformMatrix:{value:new S,type:`mat3x3<f32>`},uWorldColorAlpha:{value:new Float32Array(4),type:`vec4<f32>`},uResolution:{value:[0,0],type:`vec2<f32>`}},{isStatic:!0})}destroy(){this._renderer=null}};ht.extension={type:[b.WebGLSystem,b.WebGPUSystem,b.CanvasSystem],name:`globalUniforms`};var gt=1,Y=class{constructor(){this._tasks=[],this._offset=0}init(){u.system.add(this._update,this)}repeat(e,t,n=!0){let r=gt++,i=0;return n&&(this._offset+=1e3,i=this._offset),this._tasks.push({func:e,duration:t,start:performance.now(),offset:i,last:performance.now(),repeat:!0,id:r}),r}cancel(e){for(let t=0;t<this._tasks.length;t++)if(this._tasks[t].id===e){this._tasks.splice(t,1);return}}_update(){let e=performance.now();for(let t=0;t<this._tasks.length;t++){let n=this._tasks[t];if(e-n.offset-n.last>=n.duration){let t=e-n.start;n.func(t),n.last=e}}}destroy(){u.system.remove(this._update,this),this._tasks.length=0}};Y.extension={type:[b.WebGLSystem,b.WebGPUSystem,b.CanvasSystem],name:`scheduler`,priority:0};var _t=!1;function vt(e){if(!_t){if(s.get().getNavigator().userAgent.toLowerCase().indexOf(`chrome`)>-1){let t=[`%c  %c  %c  %c  %c PixiJS %c v${A} (${e}) http://www.pixijs.com/

`,`background: #E72264; padding:5px 0;`,`background: #6CA2EA; padding:5px 0;`,`background: #B5D33D; padding:5px 0;`,`background: #FED23F; padding:5px 0;`,`color: #FFFFFF; background: #E72264; padding:5px 0;`,`color: #E72264; background: #FFFFFF; padding:5px 0;`];globalThis.console.log(...t)}else globalThis.console&&globalThis.console.log(`PixiJS ${A} - ${e} - http://www.pixijs.com/`);_t=!0}}var X=class{constructor(e){this._renderer=e}init(e){if(e.hello){let e=this._renderer.name;this._renderer.type===r.WEBGL&&(e+=` ${this._renderer.context.webGLVersion}`),vt(e)}}};X.extension={type:[b.WebGLSystem,b.WebGPUSystem,b.CanvasSystem],name:`hello`,priority:-2},X.defaultOptions={hello:!1};function yt(e){let t=!1;for(let n in e)if(e[n]==null){t=!0;break}if(!t)return e;let n=Object.create(null);for(let t in e){let r=e[t];r&&(n[t]=r)}return n}function bt(e){let t=0;for(let n=0;n<e.length;n++)e[n]==null?t++:e[n-t]=e[n];return e.length-=t,e}var Z=class e{constructor(e){this._managedRenderables=[],this._managedHashes=[],this._managedArrays=[],this._renderer=e}init(t){t={...e.defaultOptions,...t},this.maxUnusedTime=t.renderableGCMaxUnusedTime,this._frequency=t.renderableGCFrequency,this.enabled=t.renderableGCActive}get enabled(){return!!this._handler}set enabled(e){this.enabled!==e&&(e?(this._handler=this._renderer.scheduler.repeat(()=>this.run(),this._frequency,!1),this._hashHandler=this._renderer.scheduler.repeat(()=>{for(let e of this._managedHashes)e.context[e.hash]=yt(e.context[e.hash])},this._frequency),this._arrayHandler=this._renderer.scheduler.repeat(()=>{for(let e of this._managedArrays)bt(e.context[e.hash])},this._frequency)):(this._renderer.scheduler.cancel(this._handler),this._renderer.scheduler.cancel(this._hashHandler),this._renderer.scheduler.cancel(this._arrayHandler)))}addManagedHash(e,t){this._managedHashes.push({context:e,hash:t})}addManagedArray(e,t){this._managedArrays.push({context:e,hash:t})}prerender(){this._now=performance.now()}addRenderable(e,t){this.enabled&&(e._lastUsed=this._now,e._lastInstructionTick===-1&&(this._managedRenderables.push(e),e.once(`destroyed`,this._removeRenderable,this)),e._lastInstructionTick=t.tick)}run(){let e=performance.now(),t=this._managedRenderables,n=this._renderer.renderPipes,r=0;for(let i=0;i<t.length;i++){let a=t[i];if(a===null){r++;continue}let o=(a.renderGroup??a.parentRenderGroup)?.instructionSet?.tick??-1;a._lastInstructionTick!==o&&e-a._lastUsed>this.maxUnusedTime?(a.destroyed||n[a.renderPipeId].destroyRenderable(a),a._lastInstructionTick=-1,r++,a.off(`destroyed`,this._removeRenderable,this)):t[i-r]=a}t.length-=r}destroy(){this.enabled=!1,this._renderer=null,this._managedRenderables.length=0,this._managedHashes.length=0,this._managedArrays.length=0}_removeRenderable(e){let t=this._managedRenderables.indexOf(e);t>=0&&(e.off(`destroyed`,this._removeRenderable,this),this._managedRenderables[t]=null)}};Z.extension={type:[b.WebGLSystem,b.WebGPUSystem],name:`renderableGC`,priority:0},Z.defaultOptions={renderableGCActive:!0,renderableGCMaxUnusedTime:6e4,renderableGCFrequency:3e4};var xt=Z,Q=class e{constructor(e){this._renderer=e,this.count=0,this.checkCount=0}init(t){t={...e.defaultOptions,...t},this.checkCountMax=t.textureGCCheckCountMax,this.maxIdle=t.textureGCAMaxIdle??t.textureGCMaxIdle,this.active=t.textureGCActive}postrender(){this._renderer.renderingToScreen&&(this.count++,this.active&&(this.checkCount++,this.checkCount>this.checkCountMax&&(this.checkCount=0,this.run())))}run(){let e=this._renderer.texture.managedTextures;for(let t=0;t<e.length;t++){let n=e[t];n.autoGarbageCollect&&n.resource&&n._touched>-1&&this.count-n._touched>this.maxIdle&&(n._touched=-1,n.unload())}}destroy(){this._renderer=null}};Q.extension={type:[b.WebGLSystem,b.WebGPUSystem],name:`textureGC`},Q.defaultOptions={textureGCActive:!0,textureGCAMaxIdle:null,textureGCMaxIdle:3600,textureGCCheckCountMax:600};var St=Q,$=class e{get autoDensity(){return this.texture.source.autoDensity}set autoDensity(e){this.texture.source.autoDensity=e}get resolution(){return this.texture.source._resolution}set resolution(e){this.texture.source.resize(this.texture.source.width,this.texture.source.height,e)}init(t){t={...e.defaultOptions,...t},t.view&&(ne(le,`ViewSystem.view has been renamed to ViewSystem.canvas`),t.canvas=t.view),this.screen=new y(0,0,t.width,t.height),this.canvas=t.canvas||s.get().createCanvas(),this.antialias=!!t.antialias,this.texture=ze(this.canvas,t),this.renderTarget=new H({colorTextures:[this.texture],depth:!!t.depth,isRoot:!0}),this.texture.source.transparent=t.backgroundAlpha<1,this.resolution=t.resolution}resize(e,t,n){this.texture.source.resize(e,t,n),this.screen.width=this.texture.frame.width,this.screen.height=this.texture.frame.height}destroy(e=!1){(typeof e==`boolean`?e:e?.removeView)&&this.canvas.parentNode&&this.canvas.parentNode.removeChild(this.canvas)}};$.extension={type:[b.WebGLSystem,b.WebGPUSystem,b.CanvasSystem],name:`view`,priority:0},$.defaultOptions={width:800,height:600,autoDensity:!1,antialias:!1};var Ct=[st,ht,X,$,it,St,mt,lt,M,xt,Y],wt=[ct,F,ot,Ke,ke,je,Ae,We];export{Ie as a,z as c,Me as d,Ce as f,D as g,ye as h,He as i,Pe as l,j as m,Ct as n,Le as o,we as p,Ue as r,Fe as s,wt as t,R as u};