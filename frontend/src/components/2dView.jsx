import React from 'react'
import { Component } from 'react'
import { Grid, Row, Col, Button, ListGroup, ListGroupItem } from 'react-bootstrap'
import Slider from 'rc-slider'
import 'rc-slider/assets/index.css';
import Toggle from 'react-toggle'
import { Icon } from 'react-fa'
import { inject, observer } from 'mobx-react'
import { Layer, Stage, Image, Ellipse } from 'react-konva'

import CTSliceViewer from './CTSliceViewer.jsx'


@inject("ct_store")
@inject("store_2d")
@inject("store_3d")
@observer
export default class CTItemPage extends Component {
    constructor(props) {
        super(props)
        this.state = props.store_2d.get(props.id).state
        console.log(props.id, this.state.slice)
        let s0, s1, s2
        s0 = props.ct_store.getShape(props.id, 0)
        s1 = props.ct_store.getShape(props.id, 1)
        s2 = props.ct_store.getShape(props.id, 2)

        this.state.coordinates = [
            [0, 0, s0[0], s0[1]],
            [0, 0, s1[0], s1[1]],
            [0, 0, s1[0], s1[1]]
        ]

        s0 = [s0[0] / 2, s0[1] / 2]
        s1 = [s1[0] / 2, s1[1] / 2]
        s2 = [s2[0] / 2, s2[1] / 2]

        this.state.center = [s0, s1, s2]
    }

    onSliceChange(slice, projection) {
        let a = this.state.slice
        let images = this.state.images
        a[projection] = slice
        images[projection] = null
        this.setState({slice: a, images: images})
    }

    onDepthChange(projection, depth) {
        let a = this.state.depth
        let images = this.state.images
        a[projection] = depth
        images[projection] = null
        this.setState({depth: a, images: images})
    }

    onZoom(factor, projection) {
        let center = this.state.center[projection]
        let zoom = this.state.zoom
        let id = this.props.id
        let shape = this.props.ct_store.getShape(id, projection)
        let coordinates = this.state.coordinates
        let new_coordinates = this.cropCoordinates(center[0], center[1], zoom[projection], shape[0], shape[1])
        coordinates[projection] = new_coordinates
        zoom[projection] = Math.min(256, Math.max(1, zoom[projection] * factor))

        this.setState({zoom: zoom, coordinates: coordinates})
    }

    onPointerDown(event, x, y, factors, projection) {
        if (this.state.noduleMode) {
            this.startNodule(event, x, y, factors, projection)
        } else {
            this.startMoving(event, x, y, projection)
        }
    }

    startMoving(event, x, y, projection) {
        this.setState({imageClicked: true, start: [x, y]})
    }

    getCorner(projection) {
        return this.state.coordinates[projection]
    }

    startNodule(event, x, y, factors, projection) {
        let id = this.props.id
        let corner = this.getCorner(projection)
        let shape = this.props.ct_store.getShape(id, projection)
        let nodules = this.state.nodules
        let axis = this.props.ct_store.getReverseAxis(projection)

        let base_coord = [x / factors[0] + corner[0], y / factors[1] + corner[1], this.state.slice[projection]]
        let coord = [base_coord[axis[0]], base_coord[axis[1]], base_coord[axis[2]], 0]

        this.setState({imageClicked: true,
                       chooseRadius: true,
                       nodules: [...this.state.nodules, coord],
                       start: [x, y]
                   })
    }

    onPointerUp(event, x, y, projection) {
        if (this.state.imageClicked) {
            let nodules = this.removeZeroNodule()
            this.setState({nodules: nodules, imageClicked: false, chooseRadius: false, noduleClicked: [null, -1], noduleIndex: null})
        }
    }

    removeZeroNodule() {
        let nodules = this.state.nodules
        if (nodules.length > 0){
            let nodule = nodules[nodules.length-1]
            if (nodule[3] == 0) {
                nodules.splice(nodules.length-1, 1)
            }
             }
        return nodules
    }

    onPointerLeave(event, x, y, projection) {
        this.setState({imageClicked: false, noduleClicked: [null, -1], chooseRadius: false, noduleIndex: null})
    }

    onPointerMove(event, x, y, factor, projection) {
        const delta = 3
        let shape = this.props.ct_store.getShape(this.props.id, projection)
        let bottom = shape[1] * factor[1] / this.state.zoom[projection]
        let right = shape[0] * factor[0] / this.state.zoom[projection]

        if (this.state.imageClicked) {
            {(this.state.noduleMode)
            ?
            this.selectRadius(event, x, y, factor, projection)
            :
            this.moving(event, x, y, factor, projection)}
        }
        let index = this.state.noduleIndex
        if (this.state.noduleClicked[0] != null) {
            this.onNodulePointerMove(event, index, x, y, factor, projection)            
        }
    }

    moving(event, x, y, factor, projection) {
        let center = this.state.center
        let id = this.props.id
        let corner = this.getCorner(projection)
        let shape = this.props.ct_store.getShape(id, projection)

        if (center[projection][0] == null) {
            center[projection][0] = Math.ceil(shape[0] / 2)
            center[projection][1] = Math.ceil(shape[1] / 2)
        }

        let a = center[projection][0] - (x - this.state.start[0]) / factor[0]
        let b = center[projection][1] - (y - this.state.start[1]) / factor[1]

        let start = this.state.start

        let newCoords = this.canBeCenter(id, event, a, b, projection)

        start[0] = x
        start[1] = y

        center[projection][0] = newCoords[0]
        center[projection][1] = newCoords[1]
        this.setState({center: center, start: start});
    }

    canBeCenter(id, event, x, y, projection) {
        let shape = this.props.ct_store.getShape(id, projection)
        let zoom = this.state.zoom[projection]

        let left = Math.ceil(shape[0] - shape[0] / zoom / 2)
        let right = Math.ceil(shape[0] / zoom / 2)
        let bottom = Math.ceil(shape[1] - shape[1] / zoom / 2)
        let top = Math.ceil(shape[1] / zoom / 2)

        if (x > left) {
            x = left
        } else {
            if (x < right) {
                x = right
            }
        }

        if (y < top) {
            y = top
        } else {
            if (y > bottom) {
                y = bottom
            }
        }

        return [x, y]
    }

    getRadius(index, x, y, factor, projection) {
        let id = this.props.id
        let nodules = this.state.nodules
        let nodule = this.state.nodules[index]
        let axis = this.props.ct_store.getAxis(projection)
        let spacing = this.props.ct_store.getSpacing(id, projection)

        let base_coord = this.getAbsoluteCoordinates(x, y, factor, projection)
        let r1 = (base_coord[0] - nodule[axis[0]]) * spacing[0]
        let r2 = (base_coord[1] - nodule[axis[1]]) * spacing[1]

        return Math.sqrt(r1 * r1 + r2 * r2)
    }

    getAbsoluteCoordinates(x, y, factor, projection) {
        let id = this.props.id
        let corner = this.getCorner(projection)

        return [x / factor[0] + corner[0], y / factor[1] + corner[1]]
    }

    selectRadius(event, x, y, factor, projection) {
        let nodules = this.state.nodules
        let index = nodules.length - 1
        let nodule = nodules[index]
        let radius = this.getRadius(index, x, y, factor, projection)

        x = this.getAbsoluteCoordinates(x, y, factor, projection)[0]
        y = this.getAbsoluteCoordinates(x, y, factor, projection)[1]

        let start = this.state.start

        let new_x = (x +  this.getAbsoluteCoordinates(start[0], start[1], factor, projection)[0]) / 2
        let new_y = (y +  this.getAbsoluteCoordinates(start[0], start[1], factor, projection)[1]) / 2

        let coord = [new_x, new_y, this.state.slice[projection]]
        
        let axis = this.props.ct_store.getReverseAxis(projection)

        nodule = [coord[axis[0]], coord[axis[1]], coord[axis[2]], radius]
        nodules[index] = nodule
        this.setState({nodules: nodules})

    }

    onDrawCrops() {
        this.setState({drawCrops: !this.state.drawCrops})
    }

    onDrawSlices() {
        this.setState({drawSlices: !this.state.drawSlices})
    }

    onWheelFunction() {
        this.setState({wheelZoom: !this.state.wheelZoom})
        
    }

    onAddNodule() {
        this.setState({noduleMode: !this.state.noduleMode})
    }

    onUnzoom(projection) {
        let zoom = this.state.zoom
        zoom[projection] = 1
        this.setState({zoom: zoom})
    }

    onUnzoomAll(projection) {
        this.setState({zoom: [1, 1, 1]})
    }

    onClearNodules() {
        this.setState({nodules: []})
    }

    onShowList() {
        this.setState({showList: !this.state.showList})
    }

    onNodulePointerDown(event, index, x, y, factor, projection) {
        {(this.state.noduleMode)
         ?
         this.startMoveNodule(event, index, x, y, factor, projection)
         :
         this.onPointerDown(event, x, y, factor, projection)
        }
    }

    startMoveNodule(event, index, x, y, factor, projection) {
        let selectedRadius = this.getRadius(index, x, y, factor, projection)

        let id = this.props.id
        let axis = this.props.ct_store.getAxis(projection)
        let spacing = this.props.ct_store.getSpacing(id, projection)
        
        let noduleRadius = this.state.nodules[index][3]
        let shiftInSlices = (this.state.slice[projection] - this.state.nodules[index][axis[2]]) * spacing[2]
        
        let radius = Math.sqrt(noduleRadius * noduleRadius - shiftInSlices * shiftInSlices)
        
        this.setState({noduleClicked: [event.button, index],
                       radiusRatio: selectedRadius / radius,
                       noduleIndex: index,
                       start: [x, y]})
    }



    onNodulePointerUp(event, index, x, y, factor, projection) {
        {(this.state.noduleMode)
         ?
         this.setState({noduleClicked: [null, -1], imageClicked: false, radiusRatio: 0, noduleIndex: null})
         :
         this.onPointerUp(event, x, y, factor, projection)
        }
    }

    onNodulePointerMove(event, index, x, y, factor, projection) {
        if ((this.state.noduleMode) && (this.state.noduleClicked[1] == index)) {
            switch (this.state.noduleClicked[0]) {
                case 0: this.moveNodule(event, index, x, y, factor, projection)
                case 2: this.changeRadius(event, index, x, y, factor, projection)
            }
        } else {
            this.onPointerMove(event, x, y, factor, projection)
        }
    }

    onProjectionSelector(index) {
        let projections = this.state.projections
        projections[index] = !projections[index]
        this.setState({projections: projections})
    }

    changeRadius(event, index, x, y, factor, projection) {
        let selectedRadius = this.getRadius(index, x, y, factor, projection)
        let id = this.props.id
        let axis = this.props.ct_store.getAxis(projection)
        let spacing = this.props.ct_store.getSpacing(id, projection)
        
        let nodules = this.state.nodules
        let sliceRadius = selectedRadius / this.state.radiusRatio
        let shiftInSlices = (this.state.slice[projection] - nodules[index][axis[2]]) * spacing[2]

        nodules[index][3] = Math.sqrt(sliceRadius * sliceRadius + shiftInSlices * shiftInSlices) 

        this.setState({nodules: nodules})
    }

    moveNodule(event, index, x, y, factor, projection) {
        let nodules = this.state.nodules
        let id = this.props.id
        let corner = this.getCorner(projection)
        let axis = this.props.ct_store.getReverseAxis(projection)
        let revAxis = this.props.ct_store.getAxis(projection)
        let shiftedNodule = [nodules[index][revAxis[0]] + (x - this.state.start[0]) / factor[0],
                             nodules[index][revAxis[1]] + (y - this.state.start[1]) / factor[1],
                             nodules[index][revAxis[2]]]
        nodules[index] = [shiftedNodule[axis[0]], shiftedNodule[axis[1]], shiftedNodule[axis[2]], nodules[index][3]]
        this.setState({nodules: nodules, start: [x, y]})
    }

    onNoduleContextMenu(event, index, x, y, factor, projection) {
        // if (!this.state.chooseRadius) {
        //     let nodules = this.state.nodules
        //     nodules.splice(index, 1)
        //     this.setState({nodules: nodules})
        // } else {
        //     this.setState({chooseRadius: false})
        // }
    }

    selectNodule(index) {
        let nodules = this.state.nodules
        let id = this.props.id
        let spacing = this.props.ct_store.get(id).spacing
        let shape = this.props.ct_store.get(id).shape
        let s1 = Math.ceil(nodules[index][0])
        let s2 = Math.ceil(nodules[index][1])
        let s3 = Math.ceil(nodules[index][2])

        let c1 = [nodules[index][2], nodules[index][1]]
        let c2 = [nodules[index][2], nodules[index][0]]
        let c3 = [nodules[index][1], nodules[index][0]]
        this.setState({slice: [s1, s2, s3], images: [null, null, null], center: [c1,c2,c3]})
    }

    deleteNodule(index) {
        let nodules = this.state.nodules
        nodules.splice(index, 1)
        this.setState({nodules: nodules})
    }

    renderImageViewer(item, projection) {
        projection = Number(projection)
        const resizeFactor = 2
        const maxSlice = item.shape[projection]
        if (this.state.images[projection] == null) {
            this.state.images[projection] = this.props.ct_store.getImageSlice2d(item.id, this.state.slice[projection],
                                                                                projection, this.state.depth[projection])
        }
        const spacing = this.props.ct_store.getSpacing(item.id, projection)
        const shape = this.props.ct_store.getShape(item.id, projection)

        let center = this.state.center[projection]
        let zoom = this.state.zoom[projection]

        let shift = this.cropCoordinates(center[0], center[1], zoom, shape[0], shape[1])

        return (
            <CTSliceViewer slice={this.state.slice} depth={this.state.depth} maxSlice={maxSlice - 1} vertical={true} reverse={true}
                           factor={resizeFactor} image={this.state.images[projection]} projection={projection}
                           spacing={spacing} zoom={this.state.zoom[projection]}
                           shape={shape} shift={shift} selection={this.state.selection}
                           lines={this.state.lines} id={item.id} drawCrops={this.state.drawCrops}
                           coordinates={this.state.coordinates}
                           nodules={this.state.nodules}
                           drawSlices={this.state.drawSlices}
                           wheelZoom={this.state.wheelZoom}
                           onSliceChange={this.onSliceChange.bind(this)} 
                           onDepthChange={this.onDepthChange.bind(this)} 
                           onZoom={this.onZoom.bind(this)}
                           onPointerDown={this.onPointerDown.bind(this)}
                           onPointerUp={this.onPointerUp.bind(this)}
                           onPointerMove={this.onPointerMove.bind(this)}
                           onPointerLeave={this.onPointerLeave.bind(this)}
                           onUnzoom={this.onUnzoom.bind(this)}
                           onNodulePointerDown={this.onNodulePointerDown.bind(this)}
                           onNodulePointerUp={this.onNodulePointerUp.bind(this)}
                           onNodulePointerMove={this.onNodulePointerMove.bind(this)}
                           onNoduleContextMenu={this.onNoduleContextMenu.bind(this)}
                           />
        )
    }

    renderAllImageViewers(item) {
        return (
            <div style={{display: 'inline'}}>
            <Row><Col>
            <Row>
                <Col>
                    {this.state.projections[0] ? this.renderImageViewer(item, 0) : ''}
                </Col>
                <Col>
                    {this.state.projections[1] ? this.renderImageViewer(item, 1) : ''}
                </Col>
                <Col>
                    {this.state.projections[2] ? this.renderImageViewer(item, 2) : ''}
                </Col>
                <Col width={1000}>
                {(this.state.showList) ?
                    <div>
                    <h2> {"Nodules"} </h2>
                    <ul className='nodulesList'>
                        {(this.state.nodules.length == 0)
                            ?
                         "No nodules"
                         :
                         this.state.nodules.map((nodule, index) => {
                                return <li key={'nodule'+index}>
                                    {this.noduleInfo(nodule)}
                                    <button onClick={this.selectNodule.bind(this, index)}> Move to </button>
                                    <button onClick={this.deleteNodule.bind(this, index)}> Delete </button>
                                </li>
                            })
                        }
                    </ul>
                    </div>
                    :
                    ''
                }
                </Col>
            </Row>
            </Col>
            </Row>
            </div>
        )
    }

    noduleInfo(nodule) {
        return '[' + [nodule[0].toFixed(0),
                      nodule[1].toFixed(0),
                      nodule[2].toFixed(0),
                      nodule[3].toFixed(0)].join('px, ') + ' mm]'
    }

    renderImageLoading() {
        return (
            <Icon name="spinner" spin className="loading" />
        )
    }

    renderPage(item) {
        return (
                (item.image) ?
                  this.renderAllImageViewers(item)
                  :
                  this.renderImageLoading()
                
        )
    }

    renderPageLoading() {
        return (
            <Row>
            <Col xs={12}>
                <Icon name="spinner" spin className="page loading" />
            </Col>
            </Row>
        )
    }

    render() {
        const item = this.props.ct_store.get(this.props.id)
        const buttonClass = ""

        return (
        <div className="page ct item">
            <div className='user'>
              <Icon name='home' className='user-icon' onClick={() => this.props.setPid(null)}></Icon>         
            </div>
            <div className="btn-toolbar header" role="toolbar">
                <div className='toolbar'>
                    <div className='checkbox'>
                        <input type="checkbox" className={buttonClass} onClick={this.onDrawCrops.bind(this)}/> <label> Crops </label>
                    </div>
                    <div className='checkbox'>
                        <input type="checkbox" className={buttonClass} onClick={this.onDrawSlices.bind(this)} defaultChecked={true}/> <label> Slices </label>
                    </div>
                    <div className='checkbox'>
                        <input type="checkbox" className={buttonClass} onClick={this.onWheelFunction.bind(this)}/> <label> Wheel for zoom </label>
                    </div>

                    <div className='checkbox'>
                        <input type="checkbox" className={buttonClass} onClick={this.onAddNodule.bind(this)} width={200} /> <label> Edit nodules </label>
                    </div>

                    <button type="button" className={buttonClass + ' dropdown-toggle'} data-toggle="dropdown">
                        Proj <span className="caret"></span>
                    </button>
                    <ul className="dropdown-menu" role="menu">
                      <li><a className="dropdown-item" onClick={this.onProjectionSelector.bind(this, 0)}>
                        <i className="fa fa-check" style={(this.state.projections[0]) ? {} : {display: 'none'}}></i> Axial
                    </a></li>
                    
                    <li><a className="dropdown-item" onClick={this.onProjectionSelector.bind(this, 1)}>
                        <i className="fa fa-check" style={(this.state.projections[1]) ? {} : {display: 'none'}}></i> Saggital
                    </a></li>

                    <li><a className="dropdown-item" onClick={this.onProjectionSelector.bind(this, 2)}>
                        <i className="fa fa-check" style={(this.state.projections[2]) ? {} : {display: 'none'}}></i> Coronal
                    </a></li>
                    </ul>
                    <button type="button" className={buttonClass} onClick={this.onUnzoomAll.bind(this)}> {"Unzoom"} </button>
                    <button type="button" className={buttonClass} onClick={this.onClearNodules.bind(this)}> {"Clear"} </button>
            </div>
            </div>
            {(item === undefined) ?
             this.renderPageLoading()
             :
             this.renderPage(item)
            }
        </div>
        )
    }

    cropCoordinates(centerX, centerY, zoom, width, height) {
        let x0 = 0
        let y0 = 0

        if (centerX < 0) {
            centerX = 0
        }

        if (centerX > width) {
            centerX = width
        }

        if (centerY < 0) {
            centerY = 0
        }

        if (centerY > height) {
            centerY = height
        }

        let crop_width = width * (1 / zoom)
        let crop_height = height * (1 / zoom)

        if (centerX <= crop_width / 2){
            x0 = 0
        }
        else {
            if (centerX >= width - crop_width / 2) {
                x0 = width - crop_width
            } else {
                x0 = centerX - crop_width / 2
            }
        }

        if (centerY <= crop_height / 2){
            y0 = 0
        }
        else {
            if (centerY >= height - crop_height / 2) {
                y0 = height - crop_height
            } else {
                y0 = centerY - crop_height/ 2
            }
        }
        return [Math.ceil(x0), Math.ceil(y0), Math.ceil(crop_width), Math.ceil(crop_height)]
    }

    componentWillUpdate(nextProps, nextState) {
        const item = this.props.ct_store.get(this.props.id)
        if ((item !== undefined) && (item.shape !== null)) {
            for (let projection of [0, 1, 2]) {
                let shape = this.props.ct_store.getShape(item.id, projection)
                let center = nextState.center[projection]
                let zoom = nextState.zoom[projection]
    
                let shift = this.cropCoordinates(center[0], center[1], zoom, shape[0], shape[1])
                this.state.coordinates[projection] = this.cropCoordinates(center[0], center[1], zoom, shape[0], shape[1])
                this.props.ct_store.updateStore(item.id, nextState.nodules)
            }
        }

        let shape = this.props.ct_store.get(this.props.id).shape
        let sliceZ = this.state.slice[0]
        let sliceX = this.state.slice[1]
        let sliceY = this.state.slice[2]
        this.props.store_3d.setSlices(this.props.id, [shape[0] - sliceZ, sliceY, sliceX], this.state.nodules)
    }

    componentWillUnmount () {
        this.props.store_2d.update(this.props.id, this)
    }
}
