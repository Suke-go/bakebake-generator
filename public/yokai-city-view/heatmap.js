(function(root) {
  function field(width, height, points) {
    const scale=4, w=Math.ceil(width/scale), h=Math.ceil(height/scale);
    const values=new Float32Array(w*h), horizontal=new Float32Array(w*h), blurred=new Float32Array(w*h);
    for(const point of points) {
      const x=Math.floor(point.x/scale),y=Math.floor(point.y/scale);
      if(x>=0&&x<w&&y>=0&&y<h) values[y*w+x]+=point.count || 1;
    }
    const radius=18,sigma=6, kernel=Array.from({length:radius*2+1},(_,i)=>Math.exp(-.5*((i-radius)/sigma)**2));
    const sum=kernel.reduce((a,b)=>a+b,0);
    for(let i=0;i<kernel.length;i++) kernel[i]/=sum;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      let value=0;
      for(let d=-radius;d<=radius;d++)if(x+d>=0&&x+d<w)value+=values[y*w+x+d]*kernel[d+radius];
      horizontal[y*w+x]=value;
    }
    let max=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      let value=0;
      for(let d=-radius;d<=radius;d++)if(y+d>=0&&y+d<h)value+=horizontal[(y+d)*w+x]*kernel[d+radius];
      blurred[y*w+x]=value;max=Math.max(max,value);
    }
    return {width:w,height:h,values:blurred,max};
  }
  function render(context,width,height,points) {
    const data=field(width,height,points);
    context.clearRect(0,0,width,height);
    if(!data.max)return;
    const canvas=document.createElement('canvas');canvas.width=data.width;canvas.height=data.height;
    const small=canvas.getContext('2d'); const pixels=small.createImageData(data.width,data.height);
    const denominator=Math.log1p(data.max*20);
    for(let i=0;i<data.values.length;i++) {
      const t=Math.log1p(data.values[i]*20)/denominator;
      // One colour pass after aggregation: repeated coordinates cannot stack
      // opaque discs. Alpha fades continuously into the map at the edges.
      pixels.data[i*4]=Math.round(80+175*Math.min(1,t*2));
      pixels.data[i*4+1]=Math.round(t<.5?155+90*t*2:245-170*(t-.5)*2);
      pixels.data[i*4+2]=Math.round(180*(1-t));
      pixels.data[i*4+3]=Math.round(180*Math.pow(t,.8));
    }
    small.putImageData(pixels,0,0);context.imageSmoothingEnabled=true;
    context.drawImage(canvas,0,0,width,height);
  }
  if(typeof module!=='undefined')module.exports={field};
  else root.YokaiHeatmap={render};
})(globalThis);
