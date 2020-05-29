import React from 'react'
import { Component } from 'react'
import { Container, Grid, Row, Col, Button, ListGroup, ListGroupItem } from 'react-bootstrap'
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
        let s0 = props.ct_store.getShape(props.id, 0)
        let s1 = props.ct_store.getShape(props.id, 1)
        let s2 = props.ct_store.getShape(props.id, 2)

        this.state = {
            slice: [0, 0, 0],
            depth: [1, 1, 1], // MIP depth
            coordinates: [
                [0, 0, s0[0], s0[1]],
                [0, 0, s1[0], s1[1]],
                [0, 0, s1[0], s1[1]]
            ],
            center: [
                [s0[0] / 2, s0[1] / 2],
                [s1[0] / 2, s1[1] / 2],
                [s2[0] / 2, s2[1] / 2]
            ],
            zoom: [1, 1, 1],
            imageClicked: false,
            noduleClicked: [null, -1],
            start: null, // start position of nodule
            images: [null, null, null],
            drawCrops: false,
            drawSlices: true,
            wheelZoom: false,
            chooseRadius: false,
            radiusRatio: 0,
            projections: [true, false, false],
            showList: true,
            instrumentMode: 'navigation'
        }
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
        if (this.state.instrumentMode == 'nodule') {
            this.startNodule(event, x, y, factors, projection)
        } else if (this.state.instrumentMode == 'brush') {
            this.startCurve(event, x, y, factors, projection)
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
        let axis = this.props.ct_store.getReverseAxis(projection)

        let base_coord = [x / factors[0] + corner[0], y / factors[1] + corner[1], this.state.slice[projection]]
        let nodule = [base_coord[axis[0]], base_coord[axis[1]], base_coord[axis[2]], 0, 0]

        this.setState({imageClicked: true, chooseRadius: true, start: [x, y]})
        this.props.store_2d.addNodule(id, nodule)
    }

    onPointerUp(event, x, y, projection) {
        if (this.state.imageClicked) {
            if (this.state.instrumentMode == 'brush') {
                this.stopCurve(event, projection)
            } else {
                this.setState({imageClicked: false, chooseRadius: false, noduleClicked: [null, -1], noduleIndex: null})
                this.props.store_2d.removeZeroNodule(this.props.id)
            }
        }
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
            if (this.state.instrumentMode == 'nodule') {
                this.selectRadius(event, x, y, factor, projection)
            } else if (this.state.instrumentMode == 'brush') {
                this.drawCurve(event, x, y, factor, projection)
            } else {
                this.moving(event, x, y, factor, projection)
            }
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
        let nodule = this.props.store_2d.get(id).nodules[index]
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
        let nodules = this.props.store_2d.get(this.props.id).nodules
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

        nodule = [coord[axis[0]], coord[axis[1]], coord[axis[2]], radius, 0]
        nodules[index] = nodule
        this.props.store_2d.updateNodules(this.props.id, nodules)

    }

    onDrawCrops() {
        this.setState({drawCrops: !this.state.drawCrops})
    }

    onDrawSlices() {
        this.setState({drawSlices: !this.state.drawSlices})
    }

    onWheelZoom() {
        this.setState({wheelZoom: true})
        
    }

    onWheelSlice() {
        this.setState({wheelZoom: false})
        
    }

    onAddNodule() {
        if (!this.state.confirm) {
            this.setState({instrumentMode: this.state.instrumentMode == 'nodule' ? 'navigation' : 'nodule'})
        } else {
            alert('Нодулы уже были подтверждены!')
        }
    }

    onActivateBrush() {
        this.setState({instrumentMode: this.state.instrumentMode == 'brush' ? 'navigation' : 'brush'})
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
        // if (!this.state.confirm) {
        //     this.setState({nodules: []})
        // } else {
        //     alert('Нодулы уже были подтверждены!')
        // }
    }

    onConfirmNodules() {
        // let nodules = []
        // alert('Нодулы подтверждены')
        // for (let nodule of this.state.nodules) {
        //     nodule[4] = 1
        //     nodules = [...nodules, nodule]
        // }
        // this.setState({nodules: nodules, confirm: true, noduleMode: false})
    }

    onShowList() {
        this.setState({showList: !this.state.showList})
    }

    onNodulePointerDown(event, index, x, y, factor, projection) {
        if (this.state.instrumentMode == 'nodule') {
            this.startMoveNodule(event, index, x, y, factor, projection)
        } else if (this.state.instrumentMode == 'navigation') {
            this.onPointerDown(event, x, y, factor, projection)
        } else {
            this.startCurve(event, x, y, factor, projection)
        }
    }

    startMoveNodule(event, index, x, y, factor, projection) {
        let selectedRadius = this.getRadius(index, x, y, factor, projection)

        let id = this.props.id
        let axis = this.props.ct_store.getAxis(projection)
        let spacing = this.props.ct_store.getSpacing(id, projection)
        let nodules = this.props.store_2d.get(id).nodules
        let noduleRadius = nodules[index][3]
        let shiftInSlices = (this.state.slice[projection] - nodules[index][axis[2]]) * spacing[2]

        let radius = Math.sqrt(noduleRadius * noduleRadius - shiftInSlices * shiftInSlices)

        this.setState({noduleClicked: [event.button, index],
                       radiusRatio: selectedRadius / radius,
                       noduleIndex: index,
                       start: [x, y]})
    }


    startCurve(event, x, y, factor, projection) {
        this.setState({imageClicked: true})
        console.log('startCurve')
        let corner = this.getCorner(projection)
        this.props.store_2d.addCurve(this.props.id, [
            [x / factor[0] + corner[0], y / factor[1] + corner[1]],
            [x / factor[0] + corner[0], y / factor[1] + corner[1]]
        ])
    }

    onNodulePointerUp(event, index, x, y, factor, projection) {
        if (this.state.instrumentMode == 'nodule') {
            this.setState({noduleClicked: [null, -1], imageClicked: false, radiusRatio: 0, noduleIndex: null})
        } else if (this.state.instrumentMode == 'navigation') {
            this.onPointerUp(event, x, y, factor, projection)
        } else {
            this.stopCurve(event, projection)
        }
    }

    stopCurve(event, projection) {
        // let curves = this.state.curves
        // curves.splice(curves.length, 0, this.currentCurve)
        this.setState({imageClicked: false})//, curves: curves})
        console.log('Stop curve')
    }

    onNodulePointerMove(event, index, x, y, factor, projection) {
        if ((this.state.instrumentMode == 'nodule') && (this.state.noduleClicked[1] == index)) {
            switch (this.state.noduleClicked[0]) {
                case 0: this.moveNodule(event, index, x, y, factor, projection)
                case 2: this.changeRadius(event, index, x, y, factor, projection)
            }
        } else if (this.state.instrumentMode == 'brush') {
            this.drawCurve(event, x, y, factor, projection)
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
        
        let nodules = this.props.store_2d.get(id).nodules
        let sliceRadius = selectedRadius / this.state.radiusRatio
        let shiftInSlices = (this.state.slice[projection] - nodules[index][axis[2]]) * spacing[2]

        nodules[index][3] = Math.sqrt(sliceRadius * sliceRadius + shiftInSlices * shiftInSlices) 

        this.props.store_2d.updateNodules(id, nodules)
    }

    moveNodule(event, index, x, y, factor, projection) {
        let id = this.props.id
        let nodules = this.props.store_2d.get(id).nodules
        let corner = this.getCorner(projection)
        let axis = this.props.ct_store.getReverseAxis(projection)
        let revAxis = this.props.ct_store.getAxis(projection)
        let shiftedNodule = [nodules[index][revAxis[0]] + (x - this.state.start[0]) / factor[0],
                             nodules[index][revAxis[1]] + (y - this.state.start[1]) / factor[1],
                             nodules[index][revAxis[2]]]
        nodules[index] = [shiftedNodule[axis[0]], shiftedNodule[axis[1]], shiftedNodule[axis[2]], nodules[index][3], nodules[index][4]]
        this.setState({start: [x, y]})
        this.props.store_2d.updateNodules(id, nodules)
    }

    drawCurve(event, x, y, factor, projection) {
        let curves = this.props.store_2d.get(this.props.id).curves
        let corner = this.getCorner(projection)
        curves[curves.length-1] = [...curves[curves.length-1], [x / factor[0] + corner[0], y / factor[1] + corner[1]]]
        this.props.store_2d.updateCurves(this.props.id, curves)
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
        let id = this.props.id
        let nodules = this.props.store_2d.get(id).nodules
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
        let id = this.props.id
        let nodules = this.props.store_2d.get(id).nodules
        nodules.splice(index, 1)
        this.props.store_2d.updateNodules(id, nodules)
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
                           shape={shape} shift={shift}
                           lines={this.state.lines} id={item.id} drawCrops={this.state.drawCrops}
                           coordinates={this.state.coordinates}
                           nodules={this.props.store_2d.get(item.id).nodules}
                           curves={this.props.store_2d.get(item.id).curves}
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
        let id = this.props.id
        let nodules = this.props.store_2d.get(id).nodules
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
                    <div className='nodulesList'>
                    <h2> Отмеченные нодулы </h2>
                        {(nodules.length == 0)
                            ?
                         <Row> Отсутствуют </Row>
                         :
                         nodules.map((nodule, index) => {
                                return <Row key={'nodule'+index}>
                                    <Col>
                                        <Button className='btn btn-primary toolbarButton'
                                                title='Перейти к нодуле'
                                                onClick={this.selectNodule.bind(this, index)}>
                                            <div className='user-icon'>
                                                <Icon name='location-arrow'></Icon>
                                            </div>
                                        </Button>
                                        <Button className='btn btn-danger toolbarButton' disabled={this.state.confirm}
                                                title='Удалить нодулу'
                                                onClick={this.deleteNodule.bind(this, index)}>
                                            <div className='user-icon'>
                                                <Icon name='trash'></Icon>
                                            </div>
                                        </Button>
                                    </Col>
                                    <Col>
                                        <label className='noduleCoord'>
                                            {this.noduleInfo(nodule)}
                                        </label>
                                    </Col>
                                    </Row>
                            })
                        }
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

    radioChange() {
        //
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
        let id = this.props.id
        const item = this.props.ct_store.get(this.props.id)
        const buttonClass = ""

        return (
        <div className="page ct item">
            <div className='user'>
              <Icon name='home' className='user-icon' onClick={() => this.props.setPid(null)}></Icon>         
            </div>
            <div className="btn-toolbar header" role="toolbar">
                <div className='toolbar'>


                    <div className="btn-group btn-group-toggle" data-toggle="buttons" onClick={this.props.changeMode.bind(this)}>
                        <Button className="btn btn-primary toolbarButton" title="Перейти в режим 3D">
                            <input type="checkbox" name="options" autoComplete="off"/>
                            <div className='user-icon'>
                                3D
                            </div>
                        </Button>
                    </div>

                    <div className="btn-group btn-group-toggle" data-toggle="buttons" onClick={this.onDrawCrops.bind(this)} >
                        <Button className="btn btn-primary toolbarButton" active={this.state.drawCrops} title="Отображать выделенные области других срезов">
                            <input type="checkbox" name="options" autoComplete="off"/>
                            <div className='user-icon'>
                                <Icon name='crop'></Icon>
                            </div>
                        </Button>
                    </div>

                    <div className="btn-group btn-group-toggle" data-toggle="buttons">
                        <Button className="btn btn-primary toolbarButton" active={this.state.drawSlices} title="Показывать слайсы других срезов" onClick={this.onDrawSlices.bind(this)} >
                            <input type="checkbox" name="options" autoComplete="off"/>
                            <div className='user-icon'>
                                <Icon name='sliders'></Icon>
                            </div>
                        </Button>
                    </div>


                    <div className="btn-group btn-group-toggle" data-toggle="buttons" title="Редактировать нодулы">
                        <Button className="btn btn-primary toolbarButton" active={this.state.instrumentMode == 'nodule'} disabled={this.state.confirm} onClick={this.onAddNodule.bind(this)}>
                            <input type="checkbox" name="options" autoComplete="off"/>
                            <div className='user-icon'>
                                <Icon name='circle'></Icon>
                            </div>
                        </Button>
                    </div>

                    <div className="btn-group btn-group-toggle" data-toggle="buttons" title="Рисовать линии">
                        <Button className="btn btn-primary toolbarButton" active={this.state.instrumentMode == 'brush'} disabled={this.state.confirm} onClick={this.onActivateBrush.bind(this)}>
                            <input type="checkbox" name="options" autoComplete="off"/>
                            <div className='user-icon'>
                                <Icon name='brush'></Icon>
                            </div>
                        </Button>
                    </div>

                    <div className="btn-group btn-group-toggle" data-toggle="buttons">
                      <Button className="btn btn-primary toolbarButton" id="option1" active={!this.state.wheelZoom} title="Колёсико прокручивает срезы"
                              onClick={this.onWheelSlice.bind(this)} >
                        <input type="checkbox" name="options" autoComplete="off"/>
                        <div className='resize-button'>
                            <Icon name='arrows-v'></Icon>
                            <Icon name='sliders'></Icon>
                        </div>
                      </Button>
                      <Button className="btn btn-primary toolbarButton" id="option2" active={this.state.wheelZoom} title="Колёсико управляет масштабом"
                              onClick={this.onWheelZoom.bind(this)} >
                        <input type="checkbox" name="options" autoComplete="off"/>
                        <div className='resize-button'>
                            <Icon name='arrows-v'></Icon>
                            <Icon name='search'></Icon>
                        </div>
                      </Button>
                    </div>

                    <Button type="button" className='toolbarButton btn btn-primary dropdown-toggle' data-toggle="dropdown" title="Проекции">
                        <Icon name='columns' className='user-icon'></Icon>
                        <span className="caret"></span>
                    </Button>
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
                    <Button type="button" className='toolbarButton btn btn-primary' onClick={this.onUnzoomAll.bind(this)} title="Убрать все приближения"> 
                        <div className='user-icon'>
                            <Icon name='expand'></Icon>
                        </div>
                    </Button>
                    <Button type="button" className='toolbarButton btn btn-success' disabled={this.state.confirm}
                            onClick={this.onConfirmNodules.bind(this)} title="Подтвердить нодулы">
                        <div className='user-icon'>
                            <Icon name='check'></Icon>
                        </div>
                    </Button>
                    <Button type="button" className='toolbarButton btn btn-danger' disabled={this.state.confirm}
                            onClick={this.onClearNodules.bind(this)} title="Удалить все нодулы">
                        <div className='user-icon'>
                            <Icon name='trash'></Icon>
                        </div>
                    </Button>
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
        this.props.store_3d.setSlices(this.props.id, [shape[0] - sliceZ, sliceY, sliceX], this.props.store_2d.get(this.props.id).nodules)
    }

    componentWillUnmount () {
        this.props.store_2d.update(this.props.id, this)
    }
}
