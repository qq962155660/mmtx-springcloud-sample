package io.mmtx.demo.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.mmtx.demo.feign.TestServerFeignClient;
import io.mmtx.demo.mapper.TestClientMapper;
import io.mmtx.spring.annotation.LcnTransactional;

@Service
public class TestClientService {
	
	@Autowired
	private TestServerFeignClient remoteClient;
	@Autowired
	private TestClientMapper localMapper;

	@Transactional
	public Boolean txExe() {
		remoteClient.insertRow();
		localMapper.inserTxClient("data-"+System.currentTimeMillis(),"1");
		throw new RuntimeException("mmtx exeption");
	}
	
	@LcnTransactional
	public Boolean txMM() {
		remoteClient.insertRow();
		localMapper.inserTxClient("data-"+System.currentTimeMillis(),"1");
		return true;
	}

	@LcnTransactional
	public Boolean txMMExe() {
		remoteClient.insertRow();
		localMapper.inserTxClient("data-"+System.currentTimeMillis(),"1");
		throw new RuntimeException("mmtx exeption");
	}
	
}
