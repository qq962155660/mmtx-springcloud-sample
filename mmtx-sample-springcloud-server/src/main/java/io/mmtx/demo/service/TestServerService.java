package io.mmtx.demo.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import io.mmtx.demo.mapper.TestServerMapper;


@Service
public class TestServerService {

	@Autowired
	private TestServerMapper localMapper;
	
	public Boolean insertRow() {
		localMapper.inserTxServer("data-"+System.currentTimeMillis(),"1");
		return true;
	}

}
