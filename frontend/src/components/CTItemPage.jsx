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
@observer
export default class CTItemPage extends Component {
    constructor(props) {
        super(props)
        this.state = {
            slice: [0, 0, 0],
            nodulesOn: true,
            center: [
                [null, null],
                [null, null],
                [null, null]
            ],
            zoom: [1, 1, 1],
            imageClicked: null,
            noduleClicked: null,
            start: [0, 0],
            images: [null, null, null],
            selection: [0, 0, 0, 0],
            drawCrops: false,
            drawSlices: false,
            wheelZoom: false,
            chooseRadius: false,
            nodules: []
        }
    }

    onSliceChange(slice, projection) {
        let a = this.state.slice
        let images = this.state.images
        a[projection] = slice
        images[projection] = null
        this.setState({slice: a, images: images})
    }

    onZoom(factor, projection) {
        let center = this.state.center
        let zoom = this.state.zoom

        zoom[projection] = Math.min(256, Math.max(1, zoom[projection] * factor))

        this.setState({center: center,  zoom: zoom})
    }

    onPointerDown(event, x, y, factors, projection) {
        console.log('down', event.button)
        if (event.button == 0) {
            this.startMoving(event, x, y, projection)
        } else {
            if (event.button == 2) {
                this.noduleCenter(event, x, y, factors, projection)
            }
        }
    }

    startMoving(event, x, y, projection) {
        this.setState({imageClicked: event.button, start: [x, y]})
    }

    noduleCenter(event, x, y, factors, projection) {
        console.log('Select center')
        let id = this.props.match.params.id
        let corner = this.props.ct_store.getCorner(id, projection)
        let shape = this.props.ct_store.getShape(id, projection)
        let nodules = this.state.nodules
        let axis = this.props.ct_store.getReverseAxis(projection)

        let base_coord = [x / factors[0] + corner[0], y / factors[1] + corner[1], this.state.slice[projection]]
        let coord = [base_coord[axis[0]], base_coord[axis[1]], base_coord[axis[2]], 0]

        this.setState({imageClicked: event.button, chooseRadius: true, nodules: [...this.state.nodules, coord]})
    }

    onPointerUp(event, x, y, projection) {
        console.log('up', event.button)
        if (this.state.imageClicked != null) {
            this.setState({imageClicked: null, chooseRadius: false})
        }
    }

    onPointerLeave(event, x, y, projection) {
        this.setState({imageClicked: null, noduleClicked: null, chooseRadius: false})
    }

    onPointerMove(event, x, y, factor, projection) {
        const delta = 3
        let shape = this.props.ct_store.getShape(this.props.match.params.id, projection)
        let bottom = shape[1] * factor[1] / this.state.zoom[projection]
        let right = shape[0] * factor[0] / this.state.zoom[projection]

        if (x <= delta || x >= right - delta || y <= 0 || y >= bottom - delta) {
            this.onPointerUp(event, x, y, projection)
        } else {
            switch (this.state.imageClicked) {
                case 0: this.moving(event, x, y, factor, projection); break
                case 2: this.selectRadius(event, x, y, factor, projection); break
            }
        }
    }

    moving(event, x, y, factor, projection) {
        let center = this.state.center
        let id = this.props.match.params.id
        let corner = this.props.ct_store.getCorner(id, projection)
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

    selectRadius(event, x, y, factor, projection) {
        nodules = this.state.nodules
        let nodule = this.state.nodules[nodules.length - 1]
        let id = this.props.match.params.id
        let corner = this.props.ct_store.getCorner(id, projection)
        let shape = this.props.ct_store.getShape(id, projection)
        let nodules = this.state.nodules
        let axis = this.props.ct_store.getAxis(projection)
        let spacing = this.props.ct_store.getSpacing(id, projection)

        let base_coord = [x / factor[0] + corner[0], y / factor[1] + corner[1], this.state.slice[projection]]
        let r1 = (base_coord[0] - nodule[axis[0]]) * spacing[0]
        let r2 = (base_coord[1] - nodule[axis[1]]) * spacing[1]

        let radius = Math.ceil(Math.sqrt(r1 * r1 + r2 * r2))
        nodule[3] = radius
        nodules[nodules.length - 1] = nodule
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

    onNodulePointerDown(event, index, x, y, factor, projection) {
        this.setState({noduleClicked: event.evt.button})
    }

    onNodulePointerUp(event, index, x, y, factor, projection) {
        this.setState({noduleClicked: null, imageClicked: null})
    }

    onNodulePointerMove(event, index, x, y, factor, projection) {
        if (this.state.noduleClicked == 0) {
            let nodules = this.state.nodules
            let id = this.props.match.params.id
            let corner = this.props.ct_store.getCorner(id, projection)
            let axis = this.props.ct_store.getReverseAxis(projection)
            let sliceAx = this.props.ct_store.getAxis(projection)[2]
            let shiftedNodule = [x / factor[0] + corner[0], y / factor[1] + corner[1], nodules[index][sliceAx]]
            nodules[index] = [shiftedNodule[axis[0]], shiftedNodule[axis[1]], shiftedNodule[axis[2]], nodules[index][3]]
            this.setState({nodules: nodules})
        }
    }

    onNoduleContextMenu(event, index, x, y, factor, projection) {
        if (!this.state.chooseRadius) {
            let nodules = this.state.nodules
            console.log(nodules, index)
            nodules.splice(index, 1)
            this.setState({nodules: nodules})
        } else {
            this.setState({chooseRadius: false})
        }
    }

    selectNodule(index) {
        let nodules = this.state.nodules
        let id = this.props.match.params.id
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

    renderImageViewer(item, projection) {
        const resizeFactor = 2
        const maxSlice = item.shape[projection]
        if (this.state.images[projection] == null) {
            this.state.images[projection] = this.props.ct_store.getImageSlice(item.id, this.state.slice[projection], projection)
        }
        const spacing = this.props.ct_store.getSpacing(item.id, projection)
        const shape = this.props.ct_store.getShape(item.id, projection)

        let center = this.state.center[projection]
        let zoom = this.state.zoom[projection]

        let shift = this.props.ct_store.cropCoordinates(center[0], center[1], zoom, shape[0], shape[1])
        this.props.ct_store.updateCoordinates(item.id, shift, projection)

        return (
            <CTSliceViewer slice={this.state.slice} maxSlice={maxSlice - 1} vertical={true} reverse={true}
                           factor={resizeFactor} image={this.state.images[projection]} projection={projection}
                           spacing={spacing} zoom={this.state.zoom[projection]}
                           shape={shape} shift={shift} selection={this.state.selection}
                           lines={this.state.lines} id={item.id} drawCrops={this.state.drawCrops}
                           nodules={this.state.nodules}
                           drawSlices={this.state.drawSlices}
                           wheelZoom={this.state.wheelZoom}
                           onSliceChange={this.onSliceChange.bind(this)} 
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
            <div>
                <div>
                <button className='button' onClick={this.onDrawCrops.bind(this)}> {"Crops"} </button>
                <button className='button' onClick={this.onDrawSlices.bind(this)}> {"Slices"} </button>
                <button className='button' onClick={this.onWheelFunction.bind(this)}> {"Wheel"} </button>
                <button className='button' onClick={this.onUnzoomAll.bind(this)}> {"Unzoom"} </button>
                <button className='button' onClick={this.onClearNodules.bind(this)}> {"Clear"} </button>
                </div>

                <div className='xy'>
                    {this.renderImageViewer(item, 0)}
                </div>
                <div className='xz'>
                    {this.renderImageViewer(item, 1)}
                </div>
                <div className='yz'>
                    {this.renderImageViewer(item, 2)}
                </div>
                <div  className='nodulesList'>
                    {this.state.nodules.map((nodule, index) => {
                            return <button onClick={this.selectNodule.bind(this, index)}>
                                {nodule[0].toFixed(0)} {nodule[1].toFixed(0)} {nodule[2].toFixed(0)} {nodule[3].toFixed(0)}
                            </button>
                        })}
                </div>
            </div>
        )
    }

    renderImageLoading() {
        return (
            <Icon name="spinner" spin className="loading" />
        )
    }

    renderPage(item) {
        return (
            <Row>
            <Col xs={12} sm={8} lg={6} >
                { (item.image) ?
                  this.renderAllImageViewers(item)
                  :
                  this.renderImageLoading()
                }
            </Col>
            { item.nodules ?
                <Col xs={12} sm={2} className="nodules">
                    <h3>Nodules</h3>
                    { this.renderNodulesList(item.nodules) }
                </Col>
              : null
            }
            </Row>
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
        const item = this.props.ct_store.get(this.props.match.params.id)

        return (
        <div className="page ct item">
            <Grid fluid>
            <Row>
                <Col xs={12}>
                    <h2>Patient {this.props.match.params.id}</h2>
                </Col>
            </Row>
            {(item === undefined) ?
             this.renderPageLoading()
             :
             this.renderPage(item)
            }
            </Grid>
        </div>
        )
    }
}
