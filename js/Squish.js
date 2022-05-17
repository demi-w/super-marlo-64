import * as THREE from 'three';
class Squish {
    constructor(name, object, gui, otherControls) {
        THREE.Vector3.prototype.toString = function VectorToString() {
            return '' + this.x +' ' + this.y + ' '+ this.z
        }
        object.squish = this;
        let geometry = object.geometry;
        this.object = object;
        this.geometry = object.geometry;
        this.pos = object.geometry.attributes.position.array;
        this.otherControls = otherControls;
        this.clickIdx = null;
        this.movePoint = null;

        this.stiffness = 50.0;
        this.originForce = 50.0;
        this.friction = 0.1;
        this.initialRandom = 0.01;
        this.alwaysRandom = 0.1;

        this.guiFolder = gui.addFolder(name);
        this.guiFolder.add(this,'stiffness',0.0,50.0).name('Stiffness');
        this.guiFolder.add(this,'originForce',0.0,50.0).name('Pull to Origin');
        this.guiFolder.add(this,'friction',0.0,1.0).name('Drag');
        //this.guiFolder.add(this,'alwaysRandom',0.0,10.0).name('Passive Random Offset')
        this.guiActions = this.guiFolder.addFolder('Simulation Actions');
        this.guiActions.add(this,'reset').name('Reset Simulation');
        this.guiActions.add(this,'initialRandom',0.0,10.0).name('Offset Strength');
        this.guiActions.add(this,'addOffset').name('Add Random Offset');
        this.guiActions.add(this,'fromCenter').name('Move All to Center');
        this.guiActions.open()
        this.guiFolder.open()

        this.indexed = geometry.index !== null;
        if(this.indexed){
            this.idxs = geometry.index.array;
            this.PidxToUP = new Float32Array(this.idxs.length);
        }

        this.uniquePositionsDict = {}
        this.uniquePositions = []
        for(let j = 0; j < this.pos.length; j+= 3){
            let newPos = new THREE.Vector3(this.pos[j],this.pos[j+1],this.pos[j+2])
            if (!(newPos in this.uniquePositionsDict)) {
                if(this.indexed){
                    this.PidxToUP[j/3] = this.uniquePositions.length;
                }
                this.uniquePositionsDict[newPos] = this.uniquePositions.length;
                this.uniquePositions.push([j/3])
            }
            else {
                this.uniquePositions[this.uniquePositionsDict[newPos]].push(j/3);
                if(this.indexed){
                    this.PidxToUP[j/3] = this.uniquePositionsDict[newPos];
                }
            }
        }
        this.uniquePositionsData = new Float32Array(this.uniquePositions.length*3);
        this.uniquePositionsOriginal = new Float32Array(this.uniquePositions.length*3);
        this.velocity = new Float32Array(this.uniquePositionsData.length);


        for(let i = 0; i < this.uniquePositionsData.length; i+= 3){
            this.velocity[i]=0;
            this.velocity[i+1]=0;
            this.velocity[i+2]=0;
            this.uniquePositionsData[i] = this.pos[this.uniquePositions[i/3][0]*3];
            this.uniquePositionsData[i+1] = this.pos[this.uniquePositions[i/3][0]*3+1];
            this.uniquePositionsData[i+2] = this.pos[this.uniquePositions[i/3][0]*3+2];
            this.uniquePositionsOriginal[i] = this.pos[this.uniquePositions[i/3][0]*3];
            this.uniquePositionsOriginal[i+1] = this.pos[this.uniquePositions[i/3][0]*3+1];
            this.uniquePositionsOriginal[i+2] = this.pos[this.uniquePositions[i/3][0]*3+2];
            //this.velocity[i]=0.;
        }
        
        if(this.indexed){
            this.startDist = new Float32Array(this.idxs.length);
            this.uniqueIdxs = new Float32Array(this.idxs.length);
            for(let i = 0; i < this.idxs.length; i ++){
                this.uniqueIdxs[i] = this.PidxToUP[this.idxs[i]]
            }
        }else{
            this.startDist = new Float32Array(this.pos.length/3);
            this.uniqueIdxs = new Float32Array(this.pos.length/3);
            for(let j = 0; j < this.pos.length; j+= 9){
                let a = new THREE.Vector3(this.pos[j],this.pos[j+1],this.pos[j+2]);
                let b = new THREE.Vector3(this.pos[j+3],this.pos[j+4],this.pos[j+5]);
                let c = new THREE.Vector3(this.pos[j+6],this.pos[j+7],this.pos[j+8]);
                let aIdx = this.uniquePositionsDict[a]
                let bIdx = this.uniquePositionsDict[b]
                let cIdx = this.uniquePositionsDict[c]
                this.uniqueIdxs[j/3] = aIdx;
                this.uniqueIdxs[j/3+1] = bIdx;
                this.uniqueIdxs[j/3+2] = cIdx;
            }
        }
        for(let i = 0; i < this.uniqueIdxs.length; i += 3){
            for(let j = 0; j < 3; j++){
                // connections for some array a of THREE.Vector3s starting at i
                // a[i], a[i+1]
                // a[i+1], a[i+2]
                // a[i+2], a[i]
                // k = i+1,i+2,i
                let k = i + (j+1)%3;
                let a = new THREE.Vector3(this.uniquePositionsData[this.uniqueIdxs[i+j]*3],this.uniquePositionsData[this.uniqueIdxs[i+j]*3+1],this.uniquePositionsData[this.uniqueIdxs[i+j]*3+2]);
                let b = new THREE.Vector3(this.uniquePositionsData[this.uniqueIdxs[k]*3],this.uniquePositionsData[this.uniqueIdxs[k]*3+1],this.uniquePositionsData[this.uniqueIdxs[k]*3+2]);
                this.startDist[i+j]=(a.distanceTo(b))
            }

        }
        for(let i = 0; i < this.uniquePositionsData.length; i++){
            this.uniquePositionsData[i]+=Math.sin(i*13010+0.1)*this.initialRandom
        }
        this.framesCalced = 0;
    }
    
    animate(deltaTime) {
        //deltaTime *= 10;
        //if(mario){
            //mario.rotation.z += 0.01;
            //mario.rotation.y += 0.01;
        //    mario.children[0].geometry.attributes.position.array[0] += 0.1;
        //    mario.children[0].geometry.attributes.position.array[1] += 0.1;
        //    mario.children[0].geometry.attributes.position.array[2] += 0.1;
            
        //}
        let maxDistance = 0.0;
        for(let i = 0; i < this.uniqueIdxs.length; i += 3){
            for(let j = 0; j < 3; j++){
                // connections for some array a of THREE.Vector3s starting at i
                // a[i], a[i+1]
                // a[i+1], a[i+2]
                // a[i+2], a[i]
                // k = i+1,i+2,i
                let k = i + (j+1)%3;
                let aIdx = this.uniqueIdxs[i+j]*3;
                let bIdx = this.uniqueIdxs[k]*3;
                let a = new THREE.Vector3(this.uniquePositionsData[this.uniqueIdxs[i+j]*3],this.uniquePositionsData[this.uniqueIdxs[i+j]*3+1],this.uniquePositionsData[this.uniqueIdxs[i+j]*3+2]);
                let b = new THREE.Vector3(this.uniquePositionsData[this.uniqueIdxs[k]*3],this.uniquePositionsData[this.uniqueIdxs[k]*3+1],this.uniquePositionsData[this.uniqueIdxs[k]*3+2]);
                maxDistance = Math.max(Math.abs(a.distanceTo(b)-this.startDist[i+j]),maxDistance);
                let force = (a.distanceTo(b)-this.startDist[i+j])*this.stiffness*this.startDist[i+j]*deltaTime; //TODO (?): Currently assumes time is constant
                if(isNaN(force)){
                    debugger;
                }
                let aForce = b.clone().sub(a).normalize().multiplyScalar(force);  
                this.velocity[aIdx] = (this.velocity[aIdx]+aForce.x)*(1-this.friction*deltaTime);
                this.velocity[aIdx+1] = (this.velocity[aIdx+1]+aForce.y)*(1-this.friction*deltaTime);
                this.velocity[aIdx+2] = (this.velocity[aIdx+2]+aForce.z)*(1-this.friction*deltaTime);
                this.velocity[bIdx] = (this.velocity[bIdx]-aForce.x)*(1-this.friction*deltaTime);
                this.velocity[bIdx+1] = (this.velocity[bIdx+1]-aForce.y)*(1-this.friction*deltaTime);
                this.velocity[bIdx+2] = (this.velocity[bIdx+2]-aForce.z)*(1-this.friction*deltaTime);
                
                //this.startDist[i+j]=(a.distanceTo(b))
            }
        }
        /*for(let i = 0; i < this.velocity.length; i++){
            this.velocity[i] += 
        }*/
        //console.log("Max difference from original length:",maxDistance)
        for(let i = 0; i < this.uniquePositions.length; i++){
            this.velocity[i*3] += (this.uniquePositionsOriginal[i*3]-this.uniquePositionsData[i*3])*this.originForce*deltaTime
            this.velocity[i*3+1] += (this.uniquePositionsOriginal[i*3+1]-this.uniquePositionsData[i*3+1])*this.originForce*deltaTime
            this.velocity[i*3+2] += (this.uniquePositionsOriginal[i*3+2]-this.uniquePositionsData[i*3+2])*this.originForce*deltaTime
            this.uniquePositionsData[i*3] +=this.velocity[i*3]*deltaTime;
            this.uniquePositionsData[i*3+1] += this.velocity[i*3+1]*deltaTime;
            this.uniquePositionsData[i*3+2] += this.velocity[i*3+2]*deltaTime;
            for(let idx of this.uniquePositions[i]){
                this.pos[idx*3] = this.uniquePositionsData[i*3]
                this.pos[idx*3+1] = this.uniquePositionsData[i*3+1]
                this.pos[idx*3+2] = this.uniquePositionsData[i*3+2]
            }
        }
        this.framesCalced += 1;
        if(this.clickIdx != null && this.movePoint != null){
            this.uniquePositionsData[this.clickIdx] = this.movePoint.x;
            this.uniquePositionsData[this.clickIdx+1] = this.movePoint.y;
            this.uniquePositionsData[this.clickIdx+2] = this.movePoint.z;
            this.velocity[this.clickIdx] = 0;
            this.velocity[this.clickIdx+1] = 0;
            this.velocity[this.clickIdx+2] = 0;
        }

        //velocity[3] += 0.001;
        //geometry.setAttribute('position',pos);
        this.geometry.attributes.position.needsUpdate = true;
        //cube.rotation.x += 0.01;
        //cube.rotation.y += 0.015;
        this.geometry.computeBoundingBox();
        this.geometry.computeBoundingSphere();
    }
    reset(){
        for(let i = 0; i < this.uniquePositionsData.length; i++){
            this.velocity[i] = 0;
            this.uniquePositionsData[i] = this.uniquePositionsOriginal[i];
        }
    }
    addOffset(){
        let rand = Math.random()*6.28;
        for(let i = 0; i < this.uniquePositionsData.length; i++){
            //this.velocity[i] = 0;
            this.uniquePositionsData[i] += Math.sin(i*13010*rand+0.1)*this.initialRandom;
        }
    }
    fromCenter(){
        for(let i = 0; i < this.uniquePositionsData.length; i++){
            //this.velocity[i] = 0;
            this.uniquePositionsData[i] = 0;
        }
    }
    onClick(ray,camera){
        //const raycaster = new THREE.Raycaster();
        //raycaster.setFromCamera( pointer, camera );
        let result = ray.intersectObject(this.object);

        result = result[result.length-1].point;
        this.doink = result;
        let minDist = Infinity;
        let minIdx = 0;
        for(let i = 0; i/3 < this.uniquePositions.length; i+=3){
            let p = new THREE.Vector3(this.uniquePositionsData[i],this.uniquePositionsData[i+1],this.uniquePositionsData[i+2]);
            let pDist = result.distanceTo(p);
            if(pDist < minDist){
                minDist = pDist;
                minIdx = i;
            }
        }
        this.clickIdx = minIdx;
        let p = new THREE.Vector3(this.uniquePositionsData[minIdx],this.uniquePositionsData[minIdx+1],this.uniquePositionsData[minIdx+2]);
        let camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.normalize();
        let camRay = new THREE.Ray(camera.position, camDir);
        let closestCenterpoint = new THREE.Vector3();
        camRay.closestPointToPoint(p,closestCenterpoint);
        let mag =closestCenterpoint.length();
        this.dragPlane = new THREE.Plane(closestCenterpoint.normalize().multiplyScalar(-1),closestCenterpoint);
        this.dist = p.z-camera.position.z;
        this.dz = p.z;
        
    }
    onDrag(ray){
        this.movePoint = new THREE.Vector3(ray.direction.x*this.dist*-1,ray.direction.y*this.dist*-1,this.dz);
        //ray.intersectPlane(this.dragPlane.clone(),movePoint);
    }
    stopDrag(){
        this.clickIdx = null;
        this.movePoint = null;
    }
}
export {Squish}