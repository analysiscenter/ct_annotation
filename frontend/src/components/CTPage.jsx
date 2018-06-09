import React from 'react'
import { Component } from 'react'
import { inject, observer } from 'mobx-react'
import { Icon } from 'react-fa'
import { values } from 'mobx'
import ReactBootstrapSlider from 'react-bootstrap-slider'

import VolumeView from './3dView.jsx'
import CTItemPage from './2dView.jsx'
import LoadingSpinner from './LoadingSpinner.jsx'
import Menu from './MenuPage.jsx'

@inject("ct_store")
@observer
export default class CTPage extends Component {
  constructor (props) {
    super(props)
    this.state = {
      mode: true,
      components: [null, null],
      pid: null
    }
    this.setPid = this.setPid.bind(this)
  }

  setPid(pid) {
    this.setState({pid: pid})
  }

  sliderChangeValue (value) {
    this.setState({sliderCurrentValue: value.target.value})
  }

  changeMode() {
    this.setState({mode: !this.state.mode})
  }

  render() {
    const self = this

    const nodules = []
    nodules.push([20, 98, 26, 7])
    nodules.push([44, 122, 247, 6])
    nodules.push([55, 136, 229, 7])

    if (this.props.ct_store.items === undefined) {
      return <LoadingSpinner text='Соединение с сервером' />
    }

    if (this.props.ct_store.items.size == 0) {
      return <LoadingSpinner text='Соединение с сервером' />
    }
    
    if ( this.state.pid === null ) {
      return (
        <Menu setPid={this.setPid}/>
      )
    }
    else {
      const item = this.props.ct_store.get(this.state.pid)
      if (item === undefined) {
        return <LoadingSpinner text='Загрузка снимка' />
      }
      if (item.image === null) {
        return <LoadingSpinner text='Загрузка снимка' />
      }
      return (
        <div>
          <button className='btn btn-primary toolbarButton' onClick={this.changeMode.bind(this)}> {(this.state.mode) ? '3D' : '2D'} </button>
          {(this.state.mode)
            ?
            <CTItemPage id={this.state.pid} setPid={this.setPid}/>
            :
            <VolumeView id={this.state.pid} setPid={this.setPid}/>
          }
        </div>
      )
    }
  }
}
